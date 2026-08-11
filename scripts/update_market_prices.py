"""네이버 플레이스 공개 프랜차이즈 가격을 주기적으로 스냅샷한다.

여러 일반 상권에서 같은 메뉴 가격을 모아 최빈값을 대표가로 사용한다.
수집 실패 시 기존 CSV 가격을 지우지 않는다.
"""
from __future__ import annotations

import argparse
import json
import re
import time
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from urllib.parse import quote

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
CSV_PATHS = [ROOT / "data/menus.csv", ROOT / "vercel-app/public/data/menus.csv"]
CACHE = ROOT / "data/market_prices.json"
ENDPOINT = "https://pcmap-api.place.naver.com/graphql"
SEARCH_URL = "https://map.naver.com/p/search/{query}"
SAMPLE_AREAS = {
    "서울시청": (126.9783882, 37.5666103), "대전시청": (127.3845475, 36.3504119),
    "부산시청": (129.0750222, 35.1798159), "광주시청": (126.851338, 35.160102),
    "수원시청": (127.0286009, 37.263476),
}
QUERY = """query getRestaurants($input: RestaurantsInput, $isNmap: Boolean!, $isBounds: Boolean!) {
  restaurants(input: $input) {
    brand { name isBrand menus { name desc price source } }
    items { id name popularMenuImages { name price } }
  }
}"""


def key(value: str) -> str:
    value = re.sub(r"\([^)]*\)|\[[^]]*\]", "", str(value))
    return re.sub(r"[^0-9A-Za-z가-힣]", "", value).lower()


def price_number(value: object) -> int | None:
    digits = re.sub(r"\D", "", str(value or ""))
    return int(digits) if digits else None


def fetch_area(session: requests.Session, brand: str, area: str, x: float, y: float) -> list[dict]:
    variables = {"input": {"query": brand, "x": str(x), "y": str(y), "display": 10,
                            "start": 1, "isNmap": False, "deviceType": "pcmap"},
                 "isNmap": False, "isBounds": False}
    response = session.post(
        ENDPOINT,
        headers={"accept": "*/*", "accept-language": "ko", "content-type": "application/json",
                 "referer": SEARCH_URL.format(query=quote(brand))},
        json=[{"operationName": "getRestaurants", "variables": variables, "query": QUERY}], timeout=30)
    response.raise_for_status()
    payload = response.json()[0]["data"]["restaurants"]
    menus = (payload.get("brand") or {}).get("menus") or []
    return [{"area": area, "menu": item.get("name", ""), "price": price_number(item.get("price")),
             "source": item.get("source", "")} for item in menus if price_number(item.get("price"))]


def collect(brand: str) -> list[dict]:
    session = requests.Session()
    session.headers["user-agent"] = "Mozilla/5.0 (compatible; HanipAnsimPriceSnapshot/1.0)"
    rows, errors = [], []
    for area, (x, y) in SAMPLE_AREAS.items():
        try:
            rows.extend(fetch_area(session, brand, area, x, y))
        except (requests.RequestException, ValueError, KeyError, TypeError) as exc:
            errors.append(f"{area}: {exc}")
        time.sleep(2.0)
    if not rows:
        raise RuntimeError("가격 표본을 받지 못했습니다. 기존 데이터는 유지합니다. " + " / ".join(errors))
    return rows


def aggregate(rows: list[dict]) -> dict[str, dict]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        grouped[key(row["menu"])].append(row)
    result = {}
    for menu_key, samples in grouped.items():
        prices = [int(sample["price"]) for sample in samples]
        counts = Counter(prices)
        # 최빈값 동률일 때만 높은 값을 택해 늦게 반영된 이전 가격의 영향을 줄인다.
        representative = max(counts, key=lambda value: (counts[value], value))
        result[menu_key] = {"menu": samples[0]["menu"], "price": representative,
                            "min": min(prices), "max": max(prices), "samples": len(prices),
                            "areas": sorted({sample["area"] for sample in samples})}
    return result


def apply(brand: str, prices: dict[str, dict]) -> int:
    changed = 0
    checked = date.today().isoformat()
    for path in CSV_PATHS:
        frame = pd.read_csv(path).fillna("")
        for column in ["price", "price_note", "price_source_url", "price_checked_at"]:
            if column not in frame:
                frame[column] = ""
        local_changed = 0
        for index, row in frame[frame["brand"].eq(brand)].iterrows():
            info = prices.get(key(row["menu"]))
            if not info:
                continue
            spread = f" · {info['min']:,}~{info['max']:,}원" if info["min"] != info["max"] else ""
            frame.at[index, "price"] = info["price"]
            frame.at[index, "price_note"] = f"네이버 플레이스 대표가 · {info['samples']}개 지역 표본{spread}"
            frame.at[index, "price_source_url"] = SEARCH_URL.format(query=brand)
            frame.at[index, "price_checked_at"] = checked
            local_changed += 1
        frame.to_csv(path, index=False, encoding="utf-8")
        changed = max(changed, local_changed)
    return changed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--brand", default="써브웨이")
    args = parser.parse_args()
    rows = collect(args.brand)
    prices = aggregate(rows)
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    cache[args.brand] = {"checked_at": date.today().isoformat(), "samples": rows, "prices": prices}
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{args.brand}: 대표 가격 {len(prices)}개 수집, 앱 메뉴 {apply(args.brand, prices)}개 연결")


if __name__ == "__main__":
    main()
