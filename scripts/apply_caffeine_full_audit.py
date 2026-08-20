"""카페인 전수 감사 CSV를 현재 전체 메뉴 데이터에 순차 반영한다.

사용법:
    python scripts/apply_caffeine_full_audit.py /경로/v30_caffeine_full_audit.csv
"""
from __future__ import annotations

import csv
import re
import sys
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUTS = [ROOT / "data" / "menus.csv", ROOT / "vercel-app" / "public" / "data" / "menus.csv"]
REQUIRED = {"brand", "menu", "action", "before", "after", "source", "reason"}


def number(value: str) -> str:
    match = re.search(r"-?\d+(?:\.\d+)?", (value or "").replace(",", ""))
    return match.group() if match else ""


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("카페인 감사 CSV 경로를 입력해 주세요.")
    audit_path = Path(sys.argv[1]).expanduser()
    if not audit_path.is_file():
        raise SystemExit(f"감사 CSV를 찾을 수 없습니다: {audit_path}")

    with audit_path.open(encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        missing = REQUIRED - set(reader.fieldnames or [])
        if missing:
            raise SystemExit(f"필수 열이 없습니다: {', '.join(sorted(missing))}")
        audit_rows = list(reader)

    imported_at = date.today().isoformat()
    wanted = {(row["brand"].strip(), row["menu"].strip()) for row in audit_rows}
    for output in OUTPUTS:
        with output.open(encoding="utf-8-sig", newline="") as file:
            reader = csv.DictReader(file)
            fieldnames = reader.fieldnames or []
            rows = list(reader)

        targets: dict[tuple[str, str], dict[str, str]] = {}
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

        # 같은 메뉴에 여러 감사 단계가 있으면 CSV 순서대로 before -> after를 검증한다.
        for audit in audit_rows:
            brand = audit["brand"].strip()
            menu = audit["menu"].strip()
            row = targets[(brand, menu)]
            before = number(audit["before"])
            after = number(audit["after"])
            current = row.get("caffeine_mg", "")
            action = audit["action"].strip()
            # 일부 결측 보완은 v27에 이미 반영되어 있고, 4캔 세트 합계 감사는
            # 현재 1캔 값과 의도적으로 다르므로 해당 두 경우도 안전하게 허용한다.
            if current not in {before, after} and action != "high_total_kept":
                raise SystemExit(
                    f"{brand} · {menu}: caffeine_mg 현재값 {current!r}이 감사 전후 값 {before!r}/{after!r}과 다릅니다."
                )
            if not after:
                raise SystemExit(f"{brand} · {menu}: 감사 후 카페인 값이 없습니다.")

            row["caffeine_mg"] = after
            row["caffeine_source_name"] = audit["source"].strip()
            row["caffeine_review_status"] = action
            row["caffeine_review_note"] = audit["reason"].strip()
            row["source_date"] = imported_at

        with output.open("w", encoding="utf-8-sig", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=fieldnames, lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)

    print(f"Applied {len(audit_rows)} caffeine audit steps to {len(wanted)} menus in {len(OUTPUTS)} dataset files.")


if __name__ == "__main__":
    main()
