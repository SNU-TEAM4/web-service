from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from validate_menu_data import REQUIRED_COLUMNS, public_report, validate_rows  # noqa: E402


def valid_row(**overrides: object) -> dict[str, object]:
    row: dict[str, object] = {
        "brand": "테스트브랜드", "menu": "테스트메뉴", "category": "단품",
        "calories": 400, "protein": 20, "fat": 5, "carbs": 10, "sodium": 700,
        "allergens": "우유|대두", "source_url": "https://example.com/menu",
        "source_date": "2026-08-01", "source_date_type": "official_published",
        "verified": True, "allergen_known": True,
        "allergy_source_url": "https://example.com/allergy",
        "collected_at": "2026-08-11T03:00:00+00:00", "collection_method": "official_html",
    }
    row.update(overrides)
    return row


class ValidateMenuDataTests(unittest.TestCase):
    def test_valid_rows_pass(self) -> None:
        rows = [valid_row(menu=f"메뉴 {index}") for index in range(5)]
        report = validate_rows(rows, REQUIRED_COLUMNS)
        self.assertEqual(report["status"], "pass")
        self.assertEqual(report["summary"]["errors"], 0)
        self.assertEqual(report["summary"]["verified_rows"], 5)
        self.assertEqual(report["summary"]["allergen_known_rows"], 5)
        self.assertEqual(report["summary"]["allergen_known_rate"], 1)

    def test_public_report_excludes_row_level_errors(self) -> None:
        report = validate_rows([valid_row(menu=f"메뉴 {index}") for index in range(5)], REQUIRED_COLUMNS)
        report["mirror"] = {"identical": True, "primary_sha256": "abc"}
        published = public_report(report)
        self.assertEqual(published["status"], "pass")
        self.assertTrue(published["mirror"]["identical"])
        self.assertNotIn("errors", published)

    def test_duplicate_and_outlier_fail(self) -> None:
        rows = [valid_row(), valid_row(protein=549, source_date="2026.08.01")]
        report = validate_rows(rows, REQUIRED_COLUMNS)
        codes = {item["code"] for item in report["errors"]}
        self.assertIn("duplicate_brand_menu", codes)
        self.assertIn("numeric_outlier", codes)
        self.assertIn("invalid_iso_date", codes)


if __name__ == "__main__":
    unittest.main()
