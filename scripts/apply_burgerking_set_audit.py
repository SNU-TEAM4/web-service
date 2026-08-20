"""버거킹 세트 재검증 CSV를 현재 전체 메뉴 데이터에 부분 반영한다.

사용법:
    python scripts/apply_burgerking_set_audit.py /경로/v22_burgerking_set_audit.csv
"""
from __future__ import annotations

import csv
import sys
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUTS = [ROOT / "data" / "menus.csv", ROOT / "vercel-app" / "public" / "data" / "menus.csv"]
REQUIRED = {
    "menu", "burger_source", "set_kcal", "set_weight_g", "set_sugar_g",
    "set_protein_g", "set_sat_fat_g", "set_sodium_mg", "before_kcal", "method",
}
VALUE_MAP = {
    "calories": "set_kcal",
    "weight_g": "set_weight_g",
    "carbs": "set_sugar_g",
    "protein": "set_protein_g",
    "fat": "set_sat_fat_g",
    "sodium": "set_sodium_mg",
}
PER_100G_MAP = {
    "per_100g_kcal": "set_kcal",
    "per_100g_sugar_g": "set_sugar_g",
    "per_100g_protein_g": "set_protein_g",
    "per_100g_sat_fat_g": "set_sat_fat_g",
    "per_100g_sodium_mg": "set_sodium_mg",
}


def decimal(value: str, field: str, menu: str) -> Decimal:
    try:
        return Decimal(value.strip())
    except (AttributeError, InvalidOperation):
        raise SystemExit(f"{menu}: {field} 값이 올바른 숫자가 아닙니다: {value!r}")


def formatted(value: Decimal) -> str:
    return f"{value:.1f}"


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("버거킹 세트 감사 CSV 경로를 입력해 주세요.")
    audit_path = Path(sys.argv[1]).expanduser()
    if not audit_path.is_file():
        raise SystemExit(f"감사 CSV를 찾을 수 없습니다: {audit_path}")

    with audit_path.open(encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        missing = REQUIRED - set(reader.fieldnames or [])
        if missing:
            raise SystemExit(f"필수 열이 없습니다: {', '.join(sorted(missing))}")
        audit_rows = list(reader)

    audit_by_menu = {row["menu"].strip(): row for row in audit_rows}
    if len(audit_by_menu) != len(audit_rows):
        raise SystemExit("감사 CSV에 중복 메뉴명이 있습니다.")

    imported_at = date.today().isoformat()
    for output in OUTPUTS:
        with output.open(encoding="utf-8-sig", newline="") as file:
            reader = csv.DictReader(file)
            fieldnames = reader.fieldnames or []
            rows = list(reader)

        targets: dict[str, dict[str, str]] = {}
        for row in rows:
            if row.get("brand") == "버거킹" and row.get("menu") in audit_by_menu:
                menu = row["menu"]
                if menu in targets:
                    raise SystemExit(f"{output}: 버거킹 메뉴가 중복되었습니다: {menu}")
                targets[menu] = row
        unmatched = set(audit_by_menu) - set(targets)
        if unmatched:
            raise SystemExit(f"{output}: 매칭되지 않은 메뉴: {', '.join(sorted(unmatched))}")

        for menu, row in targets.items():
            audit = audit_by_menu[menu]
            weight = decimal(audit["set_weight_g"], "set_weight_g", menu)
            if weight <= 0:
                raise SystemExit(f"{menu}: set_weight_g는 0보다 커야 합니다.")
            for target_field, source_field in VALUE_MAP.items():
                row[target_field] = formatted(decimal(audit[source_field], source_field, menu))
            for target_field, source_field in PER_100G_MAP.items():
                total = decimal(audit[source_field], source_field, menu)
                row[target_field] = formatted(total * Decimal(100) / weight)

            method = audit["method"].strip()
            burger_source = audit["burger_source"].strip()
            before_kcal = audit["before_kcal"].strip()
            row["source_date"] = imported_at
            row["nutrition_basis"] = "세트 구성 합산 기준"
            row["nutrition_serving_text"] = f"버거 + 프렌치프라이(R) + 콜라(R), 총 {formatted(weight)}g"
            row["nutrition_source_name"] = burger_source
            row["nutrition_review_status"] = "set_audit_completed"
            row["nutrition_review_note"] = f"{method} 합산 검증; 변경 전 열량 {before_kcal} kcal"
            row["nutrition_name_match_status"] = "set_components_matched"
            row["_nutrition_match"] = "burger_plus_friesR_plus_colaR"

        with output.open("w", encoding="utf-8-sig", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=fieldnames, lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)

    print(f"Applied {len(audit_rows)} Burger King set audits to {len(OUTPUTS)} dataset files.")


if __name__ == "__main__":
    main()
