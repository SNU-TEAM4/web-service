"""영양성분 이상치 감사 CSV를 현재 전체 메뉴 데이터에 부분 반영한다.

사용법:
    python scripts/apply_nutrient_outlier_audit.py /경로/v28_nutrient_outlier_audit.csv
"""
from __future__ import annotations

import csv
import re
import sys
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUTS = [ROOT / "data" / "menus.csv", ROOT / "vercel-app" / "public" / "data" / "menus.csv"]
REQUIRED = {"brand", "menu", "field", "before", "after", "action", "reason"}
SUPPORTED_FIELDS = {"cholesterol", "caffeine_mg"}


def number(value: str) -> str:
    match = re.search(r"-?\d+(?:\.\d+)?", (value or "").replace(",", ""))
    if not match:
        raise SystemExit(f"숫자 값을 찾을 수 없습니다: {value!r}")
    return match.group()


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("영양 이상치 감사 CSV 경로를 입력해 주세요.")
    audit_path = Path(sys.argv[1]).expanduser()
    if not audit_path.is_file():
        raise SystemExit(f"감사 CSV를 찾을 수 없습니다: {audit_path}")

    with audit_path.open(encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        missing = REQUIRED - set(reader.fieldnames or [])
        if missing:
            raise SystemExit(f"필수 열이 없습니다: {', '.join(sorted(missing))}")
        audit_rows = list(reader)

    keys = [(row["brand"].strip(), row["menu"].strip(), row["field"].strip()) for row in audit_rows]
    if len(set(keys)) != len(keys):
        raise SystemExit("감사 CSV에 중복된 브랜드·메뉴·필드가 있습니다.")
    unsupported = {field for _, _, field in keys} - SUPPORTED_FIELDS
    if unsupported:
        raise SystemExit(f"지원하지 않는 감사 필드입니다: {', '.join(sorted(unsupported))}")

    imported_at = date.today().isoformat()
    for output in OUTPUTS:
        with output.open(encoding="utf-8-sig", newline="") as file:
            reader = csv.DictReader(file)
            fieldnames = reader.fieldnames or []
            rows = list(reader)

        targets: dict[tuple[str, str], dict[str, str]] = {}
        wanted = {(brand, menu) for brand, menu, _ in keys}
        for row in rows:
            key = (row.get("brand", ""), row.get("menu", ""))
            if key in wanted:
                if key in targets:
                    raise SystemExit(f"{output}: 메뉴가 중복되었습니다: {key[0]} · {key[1]}")
                targets[key] = row
        unmatched = wanted - set(targets)
        if unmatched:
            labels = [f"{brand} · {menu}" for brand, menu in sorted(unmatched)]
            raise SystemExit(f"{output}: 매칭되지 않은 메뉴: {', '.join(labels)}")

        for audit in audit_rows:
            brand = audit["brand"].strip()
            menu = audit["menu"].strip()
            field = audit["field"].strip()
            row = targets[(brand, menu)]
            before = number(audit["before"])
            after = number(audit["after"])

            if field == "cholesterol":
                if row.get("cholesterol_g", "") != before:
                    raise SystemExit(
                        f"{brand} · {menu}: cholesterol_g 현재값 {row.get('cholesterol_g')!r}이 감사 전 값 {before!r}과 다릅니다."
                    )
                row["cholesterol_mg"] = after
                row["cholesterol_g"] = ""
                row["nutrition_review_status"] = audit["action"].strip()
                row["nutrition_review_note"] = audit["reason"].strip()
            else:
                if row.get("caffeine_mg", "") != before:
                    raise SystemExit(
                        f"{brand} · {menu}: caffeine_mg 현재값 {row.get('caffeine_mg')!r}이 감사 전 값 {before!r}과 다릅니다."
                    )
                row["caffeine_mg"] = after
                row["caffeine_review_status"] = audit["action"].strip()
                row["caffeine_review_note"] = audit["reason"].strip()
            row["source_date"] = imported_at

        with output.open("w", encoding="utf-8-sig", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=fieldnames, lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)

    print(f"Applied {len(audit_rows)} nutrient outlier audits to {len(OUTPUTS)} dataset files.")


if __name__ == "__main__":
    main()
