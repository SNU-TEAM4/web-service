"""최종 제출용 한글 메뉴 마스터 CSV를 웹앱 데이터 형식으로 변환한다.

사용법:
    python scripts/import_final_dataset.py /경로/hanip_ansim_final_dataset.csv

원본은 보존하며, 웹앱과 Streamlit 앱이 읽는 두 CSV를 같은 내용으로 갱신한다.
"""
from __future__ import annotations

import csv
import json
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
    "price_checked_at", "allergy_notice", "allergy_confidence", "nutrition_basis", "nutrition_serving_text",
    "weight_g", "weight_text", "menu_total_weight_g", "menu_total_weight_min_g", "menu_total_weight_max_g",
    "menu_total_weight_display", "menu_total_weight_basis_type", "nutrition_label_basis_weight_g",
    "nutrition_label_basis_display", "weight_basis_source_type", "weight_basis_source_url", "weight_basis_note",
    "kcal_min", "kcal_max", "nutrition_source_name", "nutrition_source_url",
    "per_100g_kcal", "per_100g_sugar_g", "per_100g_protein_g", "per_100g_sat_fat_g", "per_100g_sodium_mg",
    "total_carbs_g", "total_fat_g", "trans_fat_g", "cholesterol_mg", "cholesterol_g", "caffeine_mg", "dietary_fiber_g",
    "per_100g_carbs_g", "per_100g_fat_g", "per_100g_trans_fat_g", "per_100g_cholesterol_mg",
    "per_100g_cholesterol_g", "per_100g_caffeine_mg", "weight_min_g", "weight_max_g",
    "estimated_total_kcal_min", "estimated_total_kcal_max", "estimated_total_sugar_g_min", "estimated_total_sugar_g_max",
    "estimated_total_protein_g_min", "estimated_total_protein_g_max", "estimated_total_sat_fat_g_min",
    "estimated_total_sat_fat_g_max", "estimated_total_sodium_mg_min", "estimated_total_sodium_mg_max",
    "caffeine_source_name", "caffeine_match_method", "caffeine_review_status", "caffeine_review_note",
    "caffeine_value_basis", "caffeine_serving_ml", "caffeine_units", "cholesterol_unit_correction",
    "nutrition_review_status", "nutrition_review_note", "nutrition_name_match_status",
    "_nutrition_match", "_nutrition_score", "brand_en", "menu_en", "description_en",
] + [f"al_{allergen}" for allergen in ALLERGENS]


def text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def first_meaningful_text(*values: object) -> str:
    for value in values:
        normalized = text(value)
        if normalized not in {"", "-", "N/A", "n/a"}:
            return normalized
    return ""


def number(value: object) -> str:
    value = text(value).replace(",", "")
    match = re.search(r"-?\d+(?:\.\d+)?", value)
    return match.group() if match else ""


def brand_name(value: object) -> str:
    value = text(value)
    return BRAND_ALIASES.get(value, value)


def normalize_allergens(value: object) -> list[str]:
    if isinstance(value, dict):
        value = " ".join(text(part) for part in value.values())
    raw = text(value).replace("알류", "계란").replace("난류", "계란").replace("달걀", "계란")
    if raw in {"", "-", "없음", "해당없음", "표시 성분 없음"}:
        return []
    return [allergen for allergen in ALLERGENS if allergen in raw]


def json_source_rows(source: dict[str, object]) -> list[dict[str, str]]:
    """브랜드별 메뉴 배열 형태의 최신 JSON을 기존 변환 공통 형식으로 맞춘다."""
    rows: list[dict[str, str]] = []
    for brand, items in source.items():
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            nutrition = item.get("nutrition") or {}
            if not isinstance(nutrition, dict):
                nutrition = {}
            allergy_info = item.get("allergy_info")
            if isinstance(allergy_info, dict):
                allergy_info = " ".join(text(part) for part in allergy_info.values())
            rows.append({
                "브랜드": text(brand),
                "카테고리": text(item.get("category")),
                "메뉴명": text(item.get("name")),
                "가격_원": text(item.get("price_won")),
                "가격_텍스트": text(item.get("price_text")),
                "이미지URL": text(item.get("image_url")),
                "설명": text(item.get("description")),
                "알레르기_정보": text(allergy_info),
                "알레르기_안내문구": text(item.get("allergy_note")),
                "알레르기_신뢰도": text(item.get("allergy_confidence")),
                "열량_kcal": text(nutrition.get("kcal")),
                "단백질_g": text(nutrition.get("protein_g")),
                "지방_g": text(nutrition.get("fat_g")) or text(nutrition.get("sat_fat_g")),
                "탄수화물_g": text(nutrition.get("carbs_g")) or text(nutrition.get("sugar_g")),
                "나트륨_mg": text(nutrition.get("sodium_mg")),
            })
    return rows


def normalized_csv_rows(source_rows: list[dict[str, str]]) -> list[dict[str, str]]:
    """영문 열 이름을 쓰는 최신 내보내기 CSV를 기존 변환 공통 형식으로 맞춘다."""
    rows: list[dict[str, str]] = []
    for item in source_rows:
        rows.append({
            "브랜드": text(item.get("brand")),
            "카테고리": text(item.get("category")),
            "메뉴명": text(item.get("name")),
            "가격_원": text(item.get("price_won")),
            "가격_텍스트": text(item.get("price_text")),
            "이미지URL": text(item.get("image_url")),
            "설명": text(item.get("description")),
            "알레르기_정보": text(item.get("allergy_info")),
            "알레르기_안내문구": text(item.get("allergy_note")),
            "알레르기_신뢰도": text(item.get("allergy_confidence")),
            # 피자 재검증본은 공식 1회 섭취량을 serving_* 열로 제공한다.
            "열량_kcal": text(item.get("kcal")) or text(item.get("serving_kcal")),
            "단백질_g": text(item.get("protein_g")) or text(item.get("serving_protein_g")),
            # 기존 앱의 fat/carbs 호환 열은 각각 포화지방과 당류를 의미한다.
            "지방_g": text(item.get("sat_fat_g")) or text(item.get("serving_sat_fat_g")) or text(item.get("fat_g")),
            "탄수화물_g": text(item.get("sugar_g")) or text(item.get("serving_sugar_g")) or text(item.get("carbs_g")),
            "나트륨_mg": text(item.get("sodium_mg")) or text(item.get("serving_sodium_mg")),
            "총탄수화물_g": text(item.get("carbs_g")),
            "총지방_g": text(item.get("fat_g")),
            "트랜스지방_g": text(item.get("trans_fat_g")),
            "콜레스테롤_mg": text(item.get("cholesterol_mg")),
            "콜레스테롤_g": text(item.get("cholesterol_g")),
            "카페인_mg": text(item.get("caffeine_mg")),
            "카페인_출처명": text(item.get("caffeine_source_name")),
            "카페인_매칭방식": text(item.get("caffeine_match_method")),
            "카페인_검토상태": text(item.get("caffeine_review_status")),
            "카페인_검토메모": text(item.get("caffeine_review_note")),
            "카페인_값기준": text(item.get("caffeine_value_basis")),
            "카페인_제공량_ml": text(item.get("caffeine_serving_ml")),
            "카페인_단위수": text(item.get("caffeine_units")),
            "콜레스테롤_단위정정": text(item.get("cholesterol_unit_correction")),
            "식이섬유_g": text(item.get("dietary_fiber_g")),
            "영양_기준": text(item.get("nutrition_basis")),
            "영양_제공량": text(item.get("nutrition_serving_text")) or text(item.get("nutrition_serving_info")) or text(item.get("serving_info")),
            "중량_g": text(item.get("weight_g")) or text(item.get("serving_weight_g")),
            "중량_표기": first_meaningful_text(item.get("source_weight_text"), item.get("source_reference_weight_text")),
            "메뉴_총중량_g": text(item.get("menu_total_weight_g")),
            "메뉴_총중량_최소_g": text(item.get("menu_total_weight_min_g")),
            "메뉴_총중량_최대_g": text(item.get("menu_total_weight_max_g")),
            "메뉴_총중량_표기": text(item.get("menu_total_weight_display")),
            "메뉴_총중량_기준유형": text(item.get("menu_total_weight_basis_type")),
            "영양표_기준중량_g": text(item.get("nutrition_label_basis_weight_g")),
            "영양표_기준중량_표기": text(item.get("nutrition_label_basis_display")),
            "중량기준_출처유형": text(item.get("weight_basis_source_type")),
            "중량기준_출처URL": text(item.get("weight_basis_source_url")),
            "중량기준_메모": text(item.get("weight_basis_note")),
            "열량_최소": text(item.get("kcal_min")),
            "열량_최대": text(item.get("kcal_max")),
            "100g_열량": text(item.get("per_100g_kcal")),
            "100g_당류": text(item.get("per_100g_sugar_g")),
            "100g_단백질": text(item.get("per_100g_protein_g")),
            "100g_포화지방": text(item.get("per_100g_sat_fat_g")),
            "100g_나트륨": text(item.get("per_100g_sodium_mg")),
            "100g_총탄수화물": text(item.get("per_100g_carbs_g")),
            "100g_총지방": text(item.get("per_100g_fat_g")),
            "100g_트랜스지방": text(item.get("per_100g_trans_fat_g")),
            "100g_콜레스테롤_mg": text(item.get("per_100g_cholesterol_mg")),
            "100g_콜레스테롤_g": text(item.get("per_100g_cholesterol_g")),
            "100g_카페인_mg": text(item.get("per_100g_caffeine_mg")),
            "중량_최소_g": text(item.get("weight_min_g")) or text(item.get("raw_weight_min_g")),
            "중량_최대_g": text(item.get("weight_max_g")) or text(item.get("raw_weight_max_g")),
            "추정_총열량_최소": text(item.get("estimated_total_kcal_min")),
            "추정_총열량_최대": text(item.get("estimated_total_kcal_max")),
            "추정_총당류_최소": text(item.get("estimated_total_sugar_g_min")),
            "추정_총당류_최대": text(item.get("estimated_total_sugar_g_max")),
            "추정_총단백질_최소": text(item.get("estimated_total_protein_g_min")),
            "추정_총단백질_최대": text(item.get("estimated_total_protein_g_max")),
            "추정_총포화지방_최소": text(item.get("estimated_total_sat_fat_g_min")),
            "추정_총포화지방_최대": text(item.get("estimated_total_sat_fat_g_max")),
            "추정_총나트륨_최소": text(item.get("estimated_total_sodium_mg_min")),
            "추정_총나트륨_최대": text(item.get("estimated_total_sodium_mg_max")),
            "영양_출처명": text(item.get("nutrition_source_name")),
            "영양_출처URL": text(item.get("nutrition_source_url")),
            "영양_매칭방식": text(item.get("nutrition_match_method")),
            "영양_매칭점수": text(item.get("nutrition_match_score")),
            "영양_검토상태": text(item.get("nutrition_review_status")),
            "영양_검토메모": text(item.get("nutrition_review_note")),
            "영양_이름매칭상태": text(item.get("nutrition_name_match_status")),
        })
    return rows


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
        "nutrition_basis": text(source.get("영양_기준")),
        "nutrition_serving_text": text(source.get("영양_제공량")),
        "weight_g": number(source.get("중량_g")),
        "weight_text": first_meaningful_text(source.get("중량_표기")),
        "menu_total_weight_g": number(source.get("메뉴_총중량_g")),
        "menu_total_weight_min_g": number(source.get("메뉴_총중량_최소_g")),
        "menu_total_weight_max_g": number(source.get("메뉴_총중량_최대_g")),
        "menu_total_weight_display": first_meaningful_text(source.get("메뉴_총중량_표기")),
        "menu_total_weight_basis_type": text(source.get("메뉴_총중량_기준유형")),
        "nutrition_label_basis_weight_g": number(source.get("영양표_기준중량_g")),
        "nutrition_label_basis_display": first_meaningful_text(source.get("영양표_기준중량_표기")),
        "weight_basis_source_type": text(source.get("중량기준_출처유형")),
        "weight_basis_source_url": text(source.get("중량기준_출처URL")),
        "weight_basis_note": text(source.get("중량기준_메모")),
        "kcal_min": number(source.get("열량_최소")),
        "kcal_max": number(source.get("열량_최대")),
        "per_100g_kcal": number(source.get("100g_열량")),
        "per_100g_sugar_g": number(source.get("100g_당류")),
        "per_100g_protein_g": number(source.get("100g_단백질")),
        "per_100g_sat_fat_g": number(source.get("100g_포화지방")),
        "per_100g_sodium_mg": number(source.get("100g_나트륨")),
        "total_carbs_g": number(source.get("총탄수화물_g")),
        "total_fat_g": number(source.get("총지방_g")),
        "trans_fat_g": number(source.get("트랜스지방_g")),
        "cholesterol_mg": number(source.get("콜레스테롤_mg")),
        "cholesterol_g": number(source.get("콜레스테롤_g")),
        "caffeine_mg": number(source.get("카페인_mg")),
        "dietary_fiber_g": number(source.get("식이섬유_g")),
        "per_100g_carbs_g": number(source.get("100g_총탄수화물")),
        "per_100g_fat_g": number(source.get("100g_총지방")),
        "per_100g_trans_fat_g": number(source.get("100g_트랜스지방")),
        "per_100g_cholesterol_mg": number(source.get("100g_콜레스테롤_mg")),
        "per_100g_cholesterol_g": number(source.get("100g_콜레스테롤_g")),
        "per_100g_caffeine_mg": number(source.get("100g_카페인_mg")),
        "weight_min_g": number(source.get("중량_최소_g")),
        "weight_max_g": number(source.get("중량_최대_g")),
        "estimated_total_kcal_min": number(source.get("추정_총열량_최소")),
        "estimated_total_kcal_max": number(source.get("추정_총열량_최대")),
        "estimated_total_sugar_g_min": number(source.get("추정_총당류_최소")),
        "estimated_total_sugar_g_max": number(source.get("추정_총당류_최대")),
        "estimated_total_protein_g_min": number(source.get("추정_총단백질_최소")),
        "estimated_total_protein_g_max": number(source.get("추정_총단백질_최대")),
        "estimated_total_sat_fat_g_min": number(source.get("추정_총포화지방_최소")),
        "estimated_total_sat_fat_g_max": number(source.get("추정_총포화지방_최대")),
        "estimated_total_sodium_mg_min": number(source.get("추정_총나트륨_최소")),
        "estimated_total_sodium_mg_max": number(source.get("추정_총나트륨_최대")),
        "caffeine_source_name": text(source.get("카페인_출처명")),
        "caffeine_match_method": text(source.get("카페인_매칭방식")),
        "caffeine_review_status": text(source.get("카페인_검토상태")),
        "caffeine_review_note": text(source.get("카페인_검토메모")),
        "caffeine_value_basis": text(source.get("카페인_값기준")),
        "caffeine_serving_ml": number(source.get("카페인_제공량_ml")),
        "caffeine_units": number(source.get("카페인_단위수")),
        "cholesterol_unit_correction": text(source.get("콜레스테롤_단위정정")),
        "nutrition_source_name": text(source.get("영양_출처명")),
        "nutrition_source_url": text(source.get("영양_출처URL")),
        "nutrition_review_status": text(source.get("영양_검토상태")),
        "nutrition_review_note": text(source.get("영양_검토메모")),
        "nutrition_name_match_status": text(source.get("영양_이름매칭상태")),
        "_nutrition_match": text(source.get("영양_매칭방식")),
        "_nutrition_score": number(source.get("영양_매칭점수")),
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
    if source_path.suffix.lower() == ".json":
        with source_path.open(encoding="utf-8") as file:
            source_rows = json_source_rows(json.load(file))
    else:
        with source_path.open(encoding="utf-8-sig", newline="") as file:
            source_rows = list(csv.DictReader(file))
        if source_rows and {"brand", "category", "name"}.issubset(source_rows[0]):
            source_rows = normalized_csv_rows(source_rows)
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
            confidence_is_authoritative = bool(row["nutrition_name_match_status"] or row["nutrition_review_status"] or row["_nutrition_match"])
            if not confidence_is_authoritative and not row["_nutrition_match"]:
                row["_nutrition_match"] = text(previous.get("_nutrition_match"))
            if not confidence_is_authoritative and not row["_nutrition_score"]:
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
