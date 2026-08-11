"""공식 메뉴 페이지에서 가격·이미지·설명을 기존 CSV에 보강한다."""
from __future__ import annotations

import re
import json
from concurrent.futures import ThreadPoolExecutor
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


def key(value: str) -> str:
    text = BeautifulSoup(str(value or ""), "lxml").get_text(" ", strip=True)
    text = re.sub(r"\s*(?:세트|단품)$", "", text)
    return re.sub(r"[^0-9A-Za-z가-힣]", "", text).lower()


def allergen_values(value: str) -> str:
    value = str(value or "").replace("난류", "계란").replace("달걀", "계란")
    labels = ["계란", "우유", "메밀", "땅콩", "대두", "밀", "고등어", "게", "새우", "돼지고기", "복숭아", "토마토", "아황산류", "호두", "닭고기", "쇠고기", "오징어", "조개류", "잣"]
    return "|".join(label for label in labels if label in value)


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
    first = requests.get(endpoint, params={"page": 1, "view_rows": 100, "mainCategory": 1, "subCategory": 0, "searchWord": ""}, timeout=30).json()["resultObject"]
    category_ids = [item["seq"] for item in first.get("mainCategory", [])]
    result = {}
    for category_id in category_ids:
        params = {"page": 1, "view_rows": 100, "mainCategory": category_id, "subCategory": 0, "searchWord": ""}
        category = requests.get(endpoint, params=params, timeout=30).json().get("resultObject", {})
        sub_ids = [item["seq"] for item in category.get("subCategory", [])] or [0]
        for sub_id in sub_ids:
            params["subCategory"] = sub_id
            rows = requests.get(endpoint, params=params, timeout=30).json().get("resultObject", {}).get("list", [])
            for row in rows:
                name = BeautifulSoup(row.get("korName") or "", "lxml").get_text(" ", strip=True)
                image = row.get("pcImageUrl") or row.get("pcListImageUrl") or row.get("pcListThumUrl") or ""
                description = BeautifulSoup(row.get("korContent") or "", "lxml").get_text(" ", strip=True)
                if name:
                    result[key(name)] = {"image_url": urljoin(base, image), "description": clean(description), "price_note": "매장별 확인", "media_source_url": f"{base}/kor/menu/burger"}
    return result


def starbucks() -> dict[str, dict]:
    base = "https://www.starbucks.co.kr/upload/json/menu/"
    codes = ["W0000171", "W0000060", "W0000003", "W0000004", "W0000005", "W0000422", "W0000061", "W0000075", "W0000053", "W0000062"]
    result, products = {}, []
    for code in codes:
        url = f"{base}{code}.js"
        for row in requests.get(url, timeout=30).json().get("list", []):
            name = clean(row.get("product_NM", ""))
            if not name:
                continue
            products.append(row)
            result[key(name)] = {
                "image_url": urljoin(row.get("img_UPLOAD_PATH") or "https://www.istarbucks.co.kr", row.get("file_PATH", "")),
                "description": clean(row.get("content", "")),
                "price": re.sub(r"\D", "", str(row.get("price") or "")),
                "price_note": "공식 표시가" if row.get("price") else "매장별 확인",
                "media_source_url": "https://www.starbucks.co.kr/menu/drink_list.do",
            }
    def detail(row: dict) -> tuple[str, str, str]:
        product_cd = str(row.get("product_CD") or "")
        url = f"https://www.starbucks.co.kr/menu/drink_view.do?product_cd={product_cd}"
        html = requests.get(url, timeout=30).text
        match = re.search(r'"ALLERGY"\s*:\s*"((?:\\.|[^"\\])*)"', html)
        allergy = json.loads(f'"{match.group(1)}"') if match else ""
        return key(row.get("product_NM", "")), allergy, url
    with ThreadPoolExecutor(max_workers=10) as pool:
        for menu_key, allergy, url in pool.map(detail, products):
            if menu_key in result:
                result[menu_key]["allergens"] = allergen_values(allergy)
                result[menu_key]["allergen_known"] = True
                result[menu_key]["allergy_source_url"] = url
    return result


def subway() -> dict[str, dict]:
    url = "https://www.subway.co.kr/menuList/sandwich"
    soup = BeautifulSoup(requests.get(url, timeout=30).text, "lxml")
    # 공식 표의 ●(함유)와 ★(혼입 가능)를 모두 안전 필터의 위험 성분으로 취급한다.
    labels = ["계란", "우유", "메밀", "땅콩", "대두", "밀", "고등어", "게", "새우", "돼지고기", "복숭아", "토마토", "아황산류", "호두", "닭고기", "쇠고기", "오징어", "조개류", "잣"]
    patterns = {
        "비엘티": "XX..XX...X.X.......", "치킨데리야끼": "XX..XX.....X..X....",
        "에그마요": "XX..XX.....X.....X.", "이탈리안비엠티": "XX..XX...X.X.......",
        "풀드포크바비큐": "XX..XX...X.X.......", "로스트치킨": "XX..XX.....X..XX...",
        "로티세리바비큐치킨": "XX..XX.....X..X....", "쉬림프": "XX..XX..X..X.......",
        "스파이시이탈리안": "XX..XX...X.X.......", "스테이크치즈": "XX..XX.....X...X...",
        "써브웨이클럽": "XX..XX...X.XX......", "베지": "XX..XX.....X.......",
        "참치": "XX..XX.....X.......", "치킨슬라이스": "XX..XX.....X..X....",
        "치킨베이컨아보카도": "XX..XX...X.X..X....", "스파이시쉬림프": "XX..XX..X..X.......",
        "에그슬라이스": "XX..XX.....X.......", "안창비프": "XX..XX.....X...X...",
        "안창비프머쉬룸": "XX..XX.....X...X...", "머쉬룸": "X.XXXXXXXXXXXXXXXXX",
        "피자썹": "X.XXXXXXXXXXXXX.XXX", "잠봉": "XXXXXXXXXXXXXXXXXXX",
        "잠봉플러스": "XXXXXXXXXXXXXXXXXXX", "로스트치킨아보카도": "....XX.....X..XX...",
    }
    allergy_url = "https://www.subway.co.kr/sandwichAllergy"
    result = {}
    for card in soup.select(".pd_list_wrapper li, .menu_list li"):
        name_node = card.select_one(".tit, .title, strong")
        image = card.select_one("img")
        if not name_node or not image:
            continue
        name = clean(name_node.get_text())
        desc = card.select_one(".summary p, .summary, .eng")
        menu_key = key(name)
        pattern = patterns.get(menu_key)
        result[menu_key] = {
            "image_url": urljoin(url, image.get("src") or image.get("data-src") or ""),
            "description": clean(desc.get_text(" ", strip=True)) if desc else "",
            "price_note": "매장별 확인",
            "media_source_url": url,
        }
        if pattern:
            result[menu_key].update({
                "allergens": "|".join(label for label, mark in zip(labels, pattern) if mark == "X"),
                "allergen_known": True,
                "allergy_source_url": allergy_url,
            })
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
    sources = {"맥도날드": mcdonalds(), "롯데리아": lotteria(), "스타벅스": starbucks(), "써브웨이": subway(), "배스킨라빈스": baskin(), "파리바게뜨": paris_baguette()}
    for path in CSV_PATHS:
        frame = pd.read_csv(path).fillna("")
        for column in ["image_url", "description", "price", "price_note", "media_source_url", "media_checked_at"]:
            if column not in frame:
                frame[column] = ""
        matched = 0
        for index, row in frame.iterrows():
            info = sources.get(row["brand"], {}).get(key(str(row["menu"])))
            if not info:
                if not frame.at[index, "price_note"]:
                    frame.at[index, "price_note"] = "매장별 확인"
                continue
            matched += 1
            for field, value in info.items():
                if value != "":
                    frame.at[index, field] = value
            frame.at[index, "media_checked_at"] = TODAY
        frame.to_csv(path, index=False, encoding="utf-8")
        print(f"{path}: {matched}개 공식 미디어/가격 연결")


if __name__ == "__main__":
    apply()
