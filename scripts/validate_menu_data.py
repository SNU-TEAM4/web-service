"""한입안심 메뉴 CSV의 스키마, 수치, 출처, 배포 복사본 일치 여부를 검증한다."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping
from urllib.parse import urlparse


REQUIRED_COLUMNS = [
    "brand", "menu", "category", "calories", "protein", "fat", "carbs", "sodium",
    "allergens", "source_url", "source_date", "source_date_type", "verified",
    "allergen_known", "allergy_source_url", "collected_at", "collection_method",
    "price_krw", "price_type", "price_source_url", "price_source_date", "price_note",
]
NUMERIC_LIMITS = {
    "calories": (0.0, 2500.0),
    "protein": (0.0, 200.0),
    "fat": (0.0, 150.0),
    "carbs": (0.0, 300.0),
    "sodium": (0.0, 10000.0),
}
ALLOWED_ALLERGENS = {
    "계란", "우유", "대두", "밀", "땅콩", "새우", "게", "돼지고기", "쇠고기",
    "닭고기", "토마토", "아황산류", "오징어", "조개류", "복숭아",
}
ALLOWED_DATE_TYPES = {"official_updated", "official_published", "official_version", "collected_on"}
ALLOWED_METHODS = {"official_api", "official_html", "manual_official_image"}
ALLOWED_PRICE_TYPES = {"official_online_reference", "unavailable"}
BOOLEAN_VALUES = {"true", "false"}
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _is_https(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme == "https" and bool(parsed.netloc)


def validate_rows(rows: Iterable[Mapping[str, Any]], columns: Iterable[str]) -> dict[str, Any]:
    records = [{key: _text(value) for key, value in row.items()} for row in rows]
    column_list = list(columns)
    errors: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []

    missing_columns = [column for column in REQUIRED_COLUMNS if column not in column_list]
    if missing_columns:
        errors.append({"code": "missing_columns", "columns": missing_columns})

    seen: dict[tuple[str, str], int] = {}
    brand_counts: Counter[str] = Counter()
    known_counts: Counter[str] = Counter()
    verified_rows = 0
    allergen_known_rows = 0
    price_known_rows = 0
    price_known_counts: Counter[str] = Counter()
    source_dates: Counter[str] = Counter()
    numeric_ranges: dict[str, list[float]] = {field: [] for field in NUMERIC_LIMITS}
    source_hosts: Counter[str] = Counter()

    for line_number, row in enumerate(records, start=2):
        brand = row.get("brand", "")
        menu = row.get("menu", "")
        label = {"line": line_number, "brand": brand, "menu": menu}
        if not brand or not menu or not row.get("category", ""):
            errors.append({"code": "missing_identity", **label})
        key = (brand, menu)
        if key in seen:
            errors.append({"code": "duplicate_brand_menu", "first_line": seen[key], **label})
        else:
            seen[key] = line_number
        brand_counts[brand] += 1

        for field, (lower, upper) in NUMERIC_LIMITS.items():
            raw = row.get(field, "")
            try:
                value = float(raw)
            except (TypeError, ValueError):
                errors.append({"code": "invalid_numeric", "field": field, "value": raw, **label})
                continue
            numeric_ranges[field].append(value)
            if not lower <= value <= upper:
                errors.append({
                    "code": "numeric_outlier", "field": field, "value": value,
                    "expected_range": [lower, upper], **label,
                })

        for field in ("source_url", "allergy_source_url"):
            value = row.get(field, "")
            if field == "allergy_source_url" and not value:
                continue
            if not _is_https(value):
                errors.append({"code": "invalid_https_url", "field": field, "value": value, **label})
        source_host = urlparse(row.get("source_url", "")).netloc
        if source_host:
            source_hosts[source_host] += 1

        source_date = row.get("source_date", "")
        if not ISO_DATE.fullmatch(source_date):
            errors.append({"code": "invalid_iso_date", "value": source_date, **label})
        else:
            try:
                parsed_date = date.fromisoformat(source_date)
                if parsed_date > date.today():
                    errors.append({"code": "future_source_date", "value": source_date, **label})
                source_dates[source_date] += 1
            except ValueError:
                errors.append({"code": "invalid_iso_date", "value": source_date, **label})

        if row.get("source_date_type", "") not in ALLOWED_DATE_TYPES:
            errors.append({"code": "invalid_source_date_type", "value": row.get("source_date_type", ""), **label})
        if row.get("collection_method", "") not in ALLOWED_METHODS:
            errors.append({"code": "invalid_collection_method", "value": row.get("collection_method", ""), **label})
        try:
            datetime.fromisoformat(row.get("collected_at", "").replace("Z", "+00:00"))
        except ValueError:
            errors.append({"code": "invalid_collected_at", "value": row.get("collected_at", ""), **label})

        for field in ("verified", "allergen_known"):
            value = row.get(field, "").lower()
            if value not in BOOLEAN_VALUES:
                errors.append({"code": "invalid_boolean", "field": field, "value": value, **label})
        if row.get("verified", "").lower() == "true":
            verified_rows += 1
        if row.get("allergen_known", "").lower() == "true":
            allergen_known_rows += 1
            known_counts[brand] += 1
            if not row.get("allergy_source_url", ""):
                warnings.append({"code": "known_allergen_without_dedicated_url", **label})

        tokens = {item for item in row.get("allergens", "").split("|") if item}
        unknown_tokens = sorted(tokens - ALLOWED_ALLERGENS)
        if unknown_tokens:
            errors.append({"code": "unknown_allergen_tokens", "tokens": unknown_tokens, **label})

        price_type = row.get("price_type", "")
        if price_type not in ALLOWED_PRICE_TYPES:
            errors.append({"code": "invalid_price_type", "value": price_type, **label})
        if price_type == "official_online_reference":
            try:
                price = float(row.get("price_krw", ""))
                if not 100 <= price <= 200_000 or not price.is_integer():
                    raise ValueError
            except (TypeError, ValueError):
                errors.append({"code": "invalid_price_krw", "value": row.get("price_krw", ""), **label})
            if not _is_https(row.get("price_source_url", "")):
                errors.append({"code": "invalid_https_url", "field": "price_source_url", "value": row.get("price_source_url", ""), **label})
            price_date = row.get("price_source_date", "")
            try:
                parsed_price_date = date.fromisoformat(price_date)
                if not ISO_DATE.fullmatch(price_date) or parsed_price_date > date.today():
                    raise ValueError
            except ValueError:
                errors.append({"code": "invalid_price_source_date", "value": price_date, **label})
            if not row.get("price_note", ""):
                errors.append({"code": "missing_price_note", **label})
            price_known_rows += 1
            price_known_counts[brand] += 1
        elif any(row.get(field, "") for field in ("price_krw", "price_source_url", "price_source_date")):
            errors.append({"code": "unavailable_price_has_value", **label})

    for brand, count in brand_counts.items():
        if count < 5:
            warnings.append({"code": "low_brand_coverage", "brand": brand, "rows": count})

    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    report = {
        "generated_at": generated_at,
        "status": "pass" if not errors else "fail",
        "summary": {
            "rows": len(records),
            "brands": len([brand for brand in brand_counts if brand]),
            "errors": len(errors),
            "warnings": len(warnings),
            "duplicate_brand_menu": sum(item["code"] == "duplicate_brand_menu" for item in errors),
            "verified_rows": verified_rows,
            "allergen_known_rows": allergen_known_rows,
            "allergen_known_rate": round(allergen_known_rows / len(records), 4) if records else 0,
            "price_known_rows": price_known_rows,
            "price_known_rate": round(price_known_rows / len(records), 4) if records else 0,
        },
        "coverage": {
            brand: {
                "rows": count,
                "allergen_known_rows": known_counts[brand],
                "allergen_known_rate": round(known_counts[brand] / count, 4) if count else 0,
                "price_known_rows": price_known_counts[brand],
                "price_known_rate": round(price_known_counts[brand] / count, 4) if count else 0,
            }
            for brand, count in sorted(brand_counts.items()) if brand
        },
        "numeric_ranges": {
            field: {"min": min(values), "max": max(values)} if values else {"min": None, "max": None}
            for field, values in numeric_ranges.items()
        },
        "source_dates": dict(sorted(source_dates.items())),
        "source_hosts": dict(sorted(source_hosts.items())),
        "errors": errors,
        "warnings": warnings,
    }
    return report


def public_report(report: Mapping[str, Any]) -> dict[str, Any]:
    """브라우저가 표시할 수 있는 작고 안정적인 품질 요약을 만든다."""
    return {
        "generated_at": report.get("generated_at"),
        "status": report.get("status"),
        "summary": report.get("summary", {}),
        "coverage": report.get("coverage", {}),
        "source_dates": report.get("source_dates", {}),
        "source_hosts": report.get("source_hosts", {}),
        "warnings": report.get("warnings", []),
        "mirror": report.get("mirror", {}),
    }


def read_csv(path: Path) -> tuple[list[dict[str, str]], list[str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        return list(reader), list(reader.fieldnames or [])


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--primary", type=Path, default=Path("data/menus.csv"))
    parser.add_argument("--mirror", type=Path, default=Path("vercel-app/public/data/menus.csv"))
    parser.add_argument("--report", type=Path, default=Path("reports/data-quality.json"))
    parser.add_argument("--public-report", type=Path, default=Path("vercel-app/public/data/quality.json"))
    args = parser.parse_args()

    rows, columns = read_csv(args.primary)
    report = validate_rows(rows, columns)
    if not args.mirror.exists():
        report["errors"].append({"code": "missing_mirror", "path": str(args.mirror)})
    else:
        primary_hash = sha256(args.primary)
        mirror_hash = sha256(args.mirror)
        report["mirror"] = {
            "primary": str(args.primary), "mirror": str(args.mirror),
            "primary_sha256": primary_hash, "mirror_sha256": mirror_hash,
            "identical": primary_hash == mirror_hash,
        }
        if primary_hash != mirror_hash:
            report["errors"].append({"code": "mirror_mismatch"})
    report["summary"]["errors"] = len(report["errors"])
    report["status"] = "pass" if not report["errors"] else "fail"
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.public_report.parent.mkdir(parents=True, exist_ok=True)
    args.public_report.write_text(json.dumps(public_report(report), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], **report["summary"], "report": str(args.report)}, ensure_ascii=False))
    return 0 if report["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
