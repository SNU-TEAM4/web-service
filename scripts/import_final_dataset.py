"""최종 제출용 한글 메뉴 마스터 CSV를 웹앱 데이터 형식으로 변환한다.

사용법:
    python scripts/import_final_dataset.py /경로/hanip_ansim_final_dataset.csv

원본은 보존하며, 웹앱과 Streamlit 앱이 읽는 두 CSV를 같은 내용으로 갱신한다.
"""
from __future__ import annotations

import csv
import re
import sys
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUTS = [ROOT / "data" / "menus.csv", ROOT / "vercel-app" / "public" / "data" / "menus.csv"]
ALLERGENS = [
    "계란", "우유", "메밀", "땅콩", "대두", "밀", "고등어", "게", "새우",
    "돼지고기", "복숭아", "토마토", "아황산류", "호두", "닭고기", "쇠고기",
    "오징어", "조개류", "굴", "전복", "홍합", "잣",
]
BRAND_ALIASES = {
    "파리바게트": "파리바게뜨",
    "서브웨이(영양성분 X)": "써브웨이",
    "노랑통닭(영양성분표 X)": "노랑통닭",
    "페리카나 (영양성분표 X)": "페리카나",
    "본도시락(영양성분 및 칼로리 X)": "본도시락",
    "본죽&비빔밥(영양성분 및 칼로리 X)": "본죽&비빔밥",
    "푸라닭(영양성분 정보 5개 밖에 없음)": "푸라닭",
}
HEADER = [
    "brand", "menu", "category", "yogiyo_category", "calories", "protein", "fat", "carbs", "sodium",
    "allergens", "source_url", "source_date", "verified", "allergen_known", "image_url", "description",
    "media_source_url", "media_checked_at", "allergy_source_url", "price", "price_note", "price_source_url",
    "price_checked_at", "allergy_notice", "allergy_confidence", "_nutrition_match", "_nutrition_score", "brand_en", "menu_en", "description_en",
] + [f"al_{allergen}" for allergen in ALLERGENS]


def text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def number(value: object) -> str:
    value = text(value).replace(",", "")
    match = re.search(r"-?\d+(?:\.\d+)?", value)
    return match.group() if match else ""


def brand_name(value: object) -> str:
    value = text(value)
    return BRAND_ALIASES.get(value, value)


def normalize_allergens(value: object) -> list[str]:
    raw = text(value).replace("알류", "계란").replace("난류", "계란").replace("달걀", "계란")
    if raw in {"", "-", "없음", "해당없음", "표시 성분 없음"}:
        return []
    return [allergen for allergen in ALLERGENS if allergen in raw]


def to_row(source: dict[str, str], imported_at: str) -> dict[str, str]:
    confidence = text(source.get("알레르기_신뢰도"))
    allergens = normalize_allergens(source.get("알레르기_정보"))
    # 조합 메뉴와 추정값은 선택 구성에 따라 달라질 수 있으므로 안전 필터에서 미확인으로 처리한다.
    allergen_known = confidence in {"confirmed", "confirmed_none"}
    verified = confidence.startswith("confirmed")
    row = {
        "brand": brand_name(source.get("브랜드")),
        "menu": text(source.get("메뉴명")),
        "category": text(source.get("카테고리")),
        "yogiyo_category": text(source.get("카테고리")),
        "calories": number(source.get("열량_kcal")),
        "protein": number(source.get("단백질_g")),
        "fat": number(source.get("지방_g")) or number(source.get("포화지방_g")),
        "carbs": number(source.get("탄수화물_g")) or number(source.get("당류_g")),
        "sodium": number(source.get("나트륨_mg")),
        "allergens": "|".join(allergens),
        "source_url": "",
        "source_date": imported_at,
        "verified": str(verified),
        "allergen_known": str(allergen_known),
        "image_url": text(source.get("이미지URL")),
        "description": text(source.get("설명")),
        "media_source_url": text(source.get("이미지URL")),
        "media_checked_at": imported_at,
        "allergy_source_url": "",
        "price": number(source.get("가격_원")),
        "price_note": text(source.get("가격_텍스트")),
        "price_source_url": "",
        "price_checked_at": imported_at,
        "allergy_notice": text(source.get("알레르기_안내문구")),
        "allergy_confidence": confidence,
        "_nutrition_match": "",
        "_nutrition_score": "",
        "brand_en": "",
        "menu_en": "",
        "description_en": "",
    }
    row.update({f"al_{allergen}": str(allergen in allergens) for allergen in ALLERGENS})
    return row


def main() -> None:
    source_path = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else ROOT / "hanip_ansim_final_dataset.csv"
    if not source_path.is_file():
        raise SystemExit(f"원본 CSV를 찾을 수 없습니다: {source_path}")
    with source_path.open(encoding="utf-8-sig", newline="") as file:
        source_rows = list(csv.DictReader(file))
    required = {"브랜드", "카테고리", "메뉴명", "가격_원", "알레르기_정보", "알레르기_신뢰도"}
    missing = required - set(source_rows[0] if source_rows else [])
    if missing:
        raise SystemExit(f"필수 열이 없습니다: {', '.join(sorted(missing))}")

    imported_at = date.today().isoformat()
    rows = [to_row(row, imported_at) for row in source_rows if text(row.get("브랜드")) and text(row.get("메뉴명"))]
    # 이전 수집 과정에서 검증한 영양정보 매칭 상태는 같은 브랜드·메뉴에 대해 다음 갱신에도 보존한다.
    previous_matches: dict[tuple[str, str], dict[str, str]] = {}
    if OUTPUTS[0].exists():
        with OUTPUTS[0].open(encoding="utf-8-sig", newline="") as file:
            for previous in csv.DictReader(file):
                key = (text(previous.get("brand")), text(previous.get("menu")))
                if key[0] and key[1]:
                    previous_matches[key] = previous
    for row in rows:
        previous = previous_matches.get((row["brand"], row["menu"]))
        if previous:
            row["_nutrition_match"] = text(previous.get("_nutrition_match"))
            row["_nutrition_score"] = text(previous.get("_nutrition_score"))
            row["brand_en"] = text(previous.get("brand_en"))
            row["menu_en"] = text(previous.get("menu_en"))
            row["description_en"] = text(previous.get("description_en"))
    for output in OUTPUTS:
        with output.open("w", encoding="utf-8-sig", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=HEADER, lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)
    print(f"Imported {len(rows):,} menus into {len(OUTPUTS)} dataset files.")


if __name__ == "__main__":
    main()
