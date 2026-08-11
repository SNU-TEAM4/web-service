"""공식 메뉴 페이지에서 가격·이미지·설명을 기존 CSV에 보강한다."""
from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urljoin

import pandas as pd
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).parents[1]
CSV_PATHS = [ROOT / "data" / "menus.csv", ROOT / "vercel-app" / "public" / "data" / "menus.csv"]
TODAY = "2026-08-11"


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def lotteria() -> dict[str, dict]:
    url = "https://www.lotteeatz.com/brand/ria"
    soup = BeautifulSoup(requests.get(url, timeout=30).text, "lxml")
    result = {}
    for card in soup.select(".mn-card"):
        name = card.select_one(".mn-card-name")
        image = card.select_one("img.mn-card-img")
        price = card.select_one(".mn-card-price")
        if not name:
            continue
        result[clean(name.get_text())] = {
            "image_url": image.get("src", "") if image else "",
            "price": re.sub(r"\D", "", price.get_text()) if price else "",
            "price_note": "롯데잇츠 표시가",
            "media_source_url": url,
        }
    return result


def mcdonalds() -> dict[str, dict]:
    base = "https://www.mcdonalds.co.kr"
    endpoint = f"{base}/api/v1/kor/product/product/list"
    first = requests.get(f"{endpoint}?page=1&view_rows=100&main_category=1&sub_category=0", timeout=30).json()["resultObject"]
    category_ids = [item["seq"] for item in first.get("mainCategory", [])]
    result = {}
    for category_id in category_ids:
        url = f"{endpoint}?page=1&view_rows=200&main_category={category_id}&sub_category=0"
        for row in requests.get(url, timeout=30).json().get("resultObject", {}).get("list", []):
            name = clean(row.get("korName", ""))
            image = row.get("pcImageUrl") or row.get("pcListImageUrl") or row.get("pcListThumUrl") or ""
            description = BeautifulSoup(row.get("korContent") or "", "lxml").get_text(" ", strip=True)
            if name:
                result[name] = {"image_url": urljoin(base, image), "description": clean(description), "price_note": "매장별 확인", "media_source_url": f"{base}/kor/menu/burger"}
    return result


def starbucks() -> dict[str, dict]:
    base = "https://www.starbucks.co.kr/upload/json/menu/"
    codes = ["W0000171", "W0000060", "W0000003", "W0000004", "W0000005", "W0000422", "W0000061", "W0000075", "W0000053", "W0000062"]
    result = {}
    for code in codes:
        url = f"{base}{code}.js"
        for row in requests.get(url, timeout=30).json().get("list", []):
            name = clean(row.get("product_NM", ""))
            if not name:
                continue
            result[name] = {
                "image_url": urljoin(row.get("img_UPLOAD_PATH") or "https://www.istarbucks.co.kr", row.get("file_PATH", "")),
                "description": clean(row.get("content", "")),
                "price": re.sub(r"\D", "", str(row.get("price") or "")),
                "price_note": "공식 표시가" if row.get("price") else "매장별 확인",
                "media_source_url": "https://www.starbucks.co.kr/menu/drink_list.do",
            }
    return result


def baskin() -> dict[str, dict]:
    url = "https://www.baskinrobbins.co.kr/menu/list.php?top=A"
    soup = BeautifulSoup(requests.get(url, timeout=30).text, "lxml")
    result = {}
    for link in soup.select("a.menu-list__link"):
        image = link.select_one("img.menu-list__image")
        if not image:
            continue
        name = clean(image.get("alt", ""))
        tags = link.select_one(".menu-list__hash")
        result[name] = {"image_url": urljoin(url, image.get("src", "")), "description": clean(tags.get_text()) if tags else "", "price_note": "매장별 확인", "media_source_url": url}
    return result


def paris_baguette() -> dict[str, dict]:
    url = "https://www.paris.co.kr/products/"
    soup = BeautifulSoup(requests.get(url, timeout=30).text, "lxml")
    result = {}
    for link in soup.select("a.product-list-item"):
        name = link.select_one(".product-name")
        image = link.select_one("img.product-tb")
        if name and image:
            result[clean(name.get_text())] = {"image_url": image.get("src", ""), "price_note": "매장별 확인", "media_source_url": url}
    return result


def apply() -> None:
    sources = {"맥도날드": mcdonalds(), "롯데리아": lotteria(), "스타벅스": starbucks(), "배스킨라빈스": baskin(), "파리바게뜨": paris_baguette()}
    for path in CSV_PATHS:
        frame = pd.read_csv(path).fillna("")
        for column in ["image_url", "description", "price", "price_note", "media_source_url", "media_checked_at"]:
            if column not in frame:
                frame[column] = ""
        matched = 0
        for index, row in frame.iterrows():
            info = sources.get(row["brand"], {}).get(clean(str(row["menu"])))
            if not info:
                if not frame.at[index, "price_note"]:
                    frame.at[index, "price_note"] = "매장별 확인"
                continue
            matched += 1
            for key, value in info.items():
                if value != "":
                    frame.at[index, key] = value
            frame.at[index, "media_checked_at"] = TODAY
        frame.to_csv(path, index=False, encoding="utf-8")
        print(f"{path}: {matched}개 공식 미디어/가격 연결")


if __name__ == "__main__":
    apply()
