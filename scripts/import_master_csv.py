"""Convert the integrated Korean master CSV into the web menu schema.

The master file is the source of truth. Only rows marked as representative are
published, and corrected nutrition columns are used as-is so values deliberately
blanked during QA are not restored from their raw counterparts.
"""
from __future__ import annotations

import argparse
import csv
import re
from collections import Counter
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path


ROOT = Path(__file__).parents[1]
OUTPUTS = [ROOT / "data" / "menus.csv", ROOT / "vercel-app" / "public" / "data" / "menus.csv"]

BRAND_ALIASES = {
    "BBQ": "bbq",
    "서브웨이": "써브웨이",
    "베스킨라빈스": "배스킨라빈스",
    "파리바게트": "파리바게뜨",
    "컴포즈커피": "컴포즈 커피",
    "반올림피자": "반올림 피자",
    "멕시카나치킨": "멕시카나 치킨",
    "후라이드참잘하는집": "후라이드 참 잘하는 집",
}

BRAND_CATEGORY = {
    "맥도날드": "패스트푸드", "버거킹": "패스트푸드", "롯데리아": "패스트푸드",
    "KFC": "패스트푸드", "써브웨이": "양식", "노브랜드버거": "패스트푸드",
    "맘스터치": "패스트푸드", "프랭크버거": "패스트푸드",
    "bbq": "치킨", "교촌치킨": "치킨", "굽네치킨": "치킨", "노랑통닭": "치킨",
    "멕시카나 치킨": "치킨", "자담치킨": "치킨", "페리카나": "치킨",
    "푸라닭": "치킨", "후라이드 참 잘하는 집": "치킨",
    "도미노피자": "피자·양식", "반올림 피자": "피자·양식", "파파존스": "피자·양식",
    "피자스쿨": "피자·양식", "피자알볼로": "피자·양식", "피자헛": "피자·양식",
    "이디야": "카페·디저트", "배스킨라빈스": "카페·디저트", "파리바게뜨": "카페·디저트",
    "더벤티": "카페·디저트", "던킨도너츠": "카페·디저트", "뚜레쥬르": "카페·디저트",
    "메가커피": "카페·디저트", "백억커피": "카페·디저트", "컴포즈 커피": "카페·디저트",
    "설빙": "카페·디저트", "본도시락": "한식·건강식", "본죽&비빔밥": "한식·건강식",
    "샐러디": "한식·건강식", "포케올데이": "한식·건강식",
}

ALLERGEN_COLUMNS = {
    "계란": "알레르기_난류", "우유": "알레르기_우유", "메밀": "알레르기_메밀",
    "땅콩": "알레르기_땅콩", "대두": "알레르기_대두", "밀": "알레르기_밀",
    "고등어": "알레르기_고등어", "게": "알레르기_게", "새우": "알레르기_새우",
    "돼지고기": "알레르기_돼지고기", "복숭아": "알레르기_복숭아", "토마토": "알레르기_토마토",
    "아황산류": "알레르기_아황산류", "호두": "알레르기_호두", "닭고기": "알레르기_닭고기",
    "쇠고기": "알레르기_쇠고기", "오징어": "알레르기_오징어", "조개류": "알레르기_조개류",
    "굴": "알레르기_굴", "전복": "알레르기_전복", "홍합": "알레르기_홍합", "잣": "알레르기_잣",
}

OUTPUT_COLUMNS = [
    "brand", "menu", "category", "yogiyo_category", "calories", "protein", "fat", "carbs",
    "sodium", "allergens", "source_url", "source_date", "verified", "allergen_known",
    "image_url", "description", "media_source_url", "media_checked_at", "allergy_source_url",
    "price", "price_note", "price_source_url", "price_checked_at", "_nutrition_match",
    "_nutrition_score", "_allergy_match", "_allergy_score",
] + [f"al_{name}" for name in ALLERGEN_COLUMNS]

REQUIRED_COLUMNS = {
    "브랜드", "메뉴명", "요기요_카테고리", "메뉴_설명", "가격_원", "이미지_URL", "가격_출처",
    "열량(kcal)_보정", "단백질(g)_보정", "포화지방(g)_보정", "당류(g)_보정",
    "나트륨(mg)_보정", "영양_매칭방식", "영양_매칭점수", "알레르기_매칭방식",
    "영양_출처파일", "알레르기_출처파일", "음료여부", "qa_flag", "대표행",
} | set(ALLERGEN_COLUMNS.values())


def text(value: str | None) -> str:
    return (value or "").strip()


def compact_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", text(value))


def canonical_brand(value: str) -> str:
    value = text(value)
    return BRAND_ALIASES.get(value, value)


def number(value: str | None, *, integer: bool = False) -> str:
    value = text(value).replace(",", "")
    if not value:
        return ""
    try:
        parsed = Decimal(value)
    except InvalidOperation as error:
        raise ValueError(f"숫자로 변환할 수 없는 값: {value!r}") from error
    if not parsed.is_finite():
        raise ValueError(f"유한하지 않은 숫자: {value!r}")
    if integer:
        if parsed != parsed.to_integral_value():
            raise ValueError(f"정수여야 하는 값: {value!r}")
        return str(int(parsed))
    normalized = format(parsed.normalize(), "f")
    return "0" if normalized in {"-0", ""} else normalized


def flag(value: str | None) -> bool:
    return text(value).lower() in {"1", "true", "y", "yes"}


def allergy_score(match: str) -> str:
    score = re.search(r"(\d+(?:\.\d+)?)\s*점", match)
    if score:
        return number(score.group(1))
    return "100" if match in {"exact", "exact_2차"} else ""


def convert(row: dict[str, str], checked_at: str) -> dict[str, str]:
    brand = canonical_brand(row["브랜드"])
    if brand not in BRAND_CATEGORY:
        raise ValueError(f"카테고리를 정하지 않은 브랜드: {brand}")
    menu = text(row["메뉴명"])
    if not menu:
        raise ValueError(f"메뉴명이 비어 있습니다: {brand}")

    yogiyo_category = text(row["요기요_카테고리"])
    if text(row.get("음료여부")) == "음료" and "음료" not in yogiyo_category:
        # The explicit master flag prevents milk, tea and seasonal drinks from
        # being grouped as bakery or side items when the Yogiyo title is vague.
        yogiyo_category = f"{yogiyo_category} · 음료" if yogiyo_category else "음료"

    allergen_flags = {name: flag(row[column]) for name, column in ALLERGEN_COLUMNS.items()}
    allergens = [name for name, present in allergen_flags.items() if present]
    nutrition_match = text(row["영양_매칭방식"])
    allergen_match = text(row["알레르기_매칭방식"])
    nutrition_source = text(row["영양_출처파일"])
    allergen_source = text(row["알레르기_출처파일"])
    sources = list(dict.fromkeys(source for source in [nutrition_source, allergen_source] if source))
    # A second-stage match can carry a confirmed allergen row without repeating
    # its source filename, so the matching result—not filename presence—is the
    # authoritative known/unknown signal.
    allergen_known = bool(allergen_match and allergen_match != "unmatched")
    verified = bool(
        nutrition_match and allergen_match
        and nutrition_match != "unmatched" and allergen_match != "unmatched"
        and not text(row["qa_flag"])
    )
    price = number(row["가격_원"], integer=True)
    if not price or int(price) <= 0:
        raise ValueError(f"가격이 없거나 0원 이하입니다: {brand} / {menu}")
    image_url = text(row["이미지_URL"])

    result = {
        "brand": brand,
        "menu": menu,
        "category": BRAND_CATEGORY[brand],
        "yogiyo_category": yogiyo_category,
        # Corrected columns are intentionally not backed up by raw values.
        "calories": number(row["열량(kcal)_보정"]),
        "protein": number(row["단백질(g)_보정"]),
        "fat": number(row["포화지방(g)_보정"]),
        "carbs": number(row["당류(g)_보정"]),
        "sodium": number(row["나트륨(mg)_보정"]),
        "allergens": ", ".join(allergens),
        "source_url": " | ".join(sources),
        "source_date": checked_at,
        "verified": str(verified),
        "allergen_known": str(allergen_known),
        "image_url": image_url,
        "description": compact_text(row["메뉴_설명"]),
        "media_source_url": image_url,
        "media_checked_at": checked_at if image_url else "",
        "allergy_source_url": allergen_source,
        "price": price,
        "price_note": "요기요 기준",
        "price_source_url": "https://www.yogiyo.co.kr",
        "price_checked_at": checked_at,
        "_nutrition_match": nutrition_match,
        "_nutrition_score": number(row["영양_매칭점수"]),
        "_allergy_match": allergen_match,
        "_allergy_score": allergy_score(allergen_match),
    }
    result.update({f"al_{name}": str(present) for name, present in allergen_flags.items()})
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path, help="통합마스터 CSV 경로")
    parser.add_argument("--checked-at", help="가격·미디어 확인일(YYYY-MM-DD); 기본값은 입력 파일 수정일")
    args = parser.parse_args()

    if not args.input.is_file():
        raise SystemExit(f"입력 파일을 찾을 수 없습니다: {args.input}")
    checked_at = args.checked_at or datetime.fromtimestamp(args.input.stat().st_mtime).date().isoformat()
    try:
        datetime.strptime(checked_at, "%Y-%m-%d")
    except ValueError as error:
        raise SystemExit("--checked-at은 YYYY-MM-DD 형식이어야 합니다") from error

    with args.input.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        missing = REQUIRED_COLUMNS - set(reader.fieldnames or [])
        if missing:
            raise SystemExit(f"필수 열이 없습니다: {', '.join(sorted(missing))}")
        rows = [convert(row, checked_at) for row in reader if text(row["대표행"]).upper() == "Y"]

    keys = [(row["brand"], row["menu"]) for row in rows]
    if len(keys) != len(set(keys)):
        duplicates = sorted(key for key, count in Counter(keys).items() if count > 1)
        raise SystemExit(f"대표행에 중복 브랜드/메뉴가 있습니다: {duplicates[:10]}")
    if not rows:
        raise SystemExit("대표행이 한 건도 없습니다")

    for output in OUTPUTS:
        output.parent.mkdir(parents=True, exist_ok=True)
        with output.open("w", encoding="utf-8-sig", newline="") as target:
            writer = csv.DictWriter(target, fieldnames=OUTPUT_COLUMNS, lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)

    known_allergens = sum(row["allergen_known"] == "True" for row in rows)
    sourced = sum(bool(row["source_url"]) for row in rows)
    print(f"published {len(rows):,} unique representative menus from {len(set(row['brand'] for row in rows))} brands")
    print(f"source coverage {sourced:,}/{len(rows):,}; allergen coverage {known_allergens:,}/{len(rows):,}; price coverage {len(rows):,}/{len(rows):,}")
    for output in OUTPUTS:
        print(output)


if __name__ == "__main__":
    main()
