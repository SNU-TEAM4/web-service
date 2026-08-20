"""웹앱 메뉴 CSV의 한국어 메뉴명·설명을 영어로 자동 번역한다.

사용법:
    python scripts/translate_menu_data.py

번역 결과는 menu_en, description_en, brand_en 열에 저장된다. 이미 생성된 번역은
보존하므로, 데이터셋을 갱신한 뒤 다시 실행해도 새 항목만 번역한다.
"""
from __future__ import annotations

import csv
import json
import time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
FILES = [ROOT / "data" / "menus.csv", ROOT / "vercel-app" / "public" / "data" / "menus.csv"]
FIELDS = ("brand", "menu", "description")
TRANSLATED = {"brand": "brand_en", "menu": "menu_en", "description": "description_en"}
# Korean URL-encoding expands each character, so keep each public API request compact.
MAX_CHARS = 1200


def chunks(values: list[str]) -> list[list[str]]:
    result: list[list[str]] = []
    current: list[str] = []
    size = 0
    for value in values:
        extra = len(value) + (1 if current else 0)
        if current and size + extra > MAX_CHARS:
            result.append(current)
            current, size = [], 0
        current.append(value)
        size += extra
    if current:
        result.append(current)
    return result


def translate_batch(values: list[str]) -> list[str]:
    params = urlencode({"client": "gtx", "sl": "ko", "tl": "en", "dt": "t", "q": "\n".join(values)})
    request = Request(f"https://translate.googleapis.com/translate_a/single?{params}", headers={"User-Agent": "HanipAnsim/1.0"})
    for attempt in range(4):
        try:
            with urlopen(request, timeout=30) as response:
                payload = json.loads(response.read().decode("utf-8"))
            translated = "".join(piece[0] for piece in payload[0])
            lines = translated.split("\n")
            if len(lines) == len(values):
                return [line.strip() for line in lines]
            raise ValueError("translated line count did not match input")
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError("unreachable")


def write_rows(rows: list[dict[str, str]], header: list[str]) -> None:
    for output in FILES:
        with output.open("w", encoding="utf-8-sig", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=header, lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)


def main() -> None:
    path = FILES[0]
    with path.open(encoding="utf-8-sig", newline="") as file:
        rows = list(csv.DictReader(file))
        header = list(csv.DictReader(path.open(encoding="utf-8-sig", newline="")).fieldnames or [])
    for target in TRANSLATED.values():
        if target not in header:
            header.append(target)

    for field in FIELDS:
        target = TRANSLATED[field]
        missing = list(dict.fromkeys(row[field].strip() for row in rows if row.get(field, "").strip() and not row.get(target, "").strip()))
        print(f"{field}: translating {len(missing)} value(s)")
        translations: dict[str, str] = {}
        for index, batch in enumerate(chunks(missing), 1):
            for source, translated in zip(batch, translate_batch(batch)):
                translations[source] = translated
            for row in rows:
                if not row.get(target, "").strip() and row.get(field, "").strip() in translations:
                    row[target] = translations[row[field].strip()]
            write_rows(rows, header)
            print(f"  {index}/{len(chunks(missing))}", flush=True)
            time.sleep(.12)
        for row in rows:
            if not row.get(target, "").strip() and row.get(field, "").strip():
                row[target] = translations.get(row[field].strip(), row[field].strip())

    write_rows(rows, header)


if __name__ == "__main__":
    main()
