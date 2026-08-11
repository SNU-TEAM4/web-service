"""공식 공개 페이지에서 맥도날드·롯데리아 데이터를 갱신한다."""
from __future__ import annotations

import re
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from io import StringIO
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pandas as pd
import requests
from bs4 import BeautifulSoup

OUT = Path(__file__).parents[1] / "data" / "menus.csv"
MCD_URL = "https://www.mcdonalds.co.kr/api/v1/kor/product/nutrition"
LOTTE_URL = "https://www.lotteeatz.com/upload/etc/ria/items.html"
BURGERKING_URL = "https://web-prd.burgerking.co.kr/burgerking/BKR0347.json"
STARBUCKS_BASE = "https://www.starbucks.co.kr/upload/json/menu/"
EDIYA_PAGES = {
    "https://ediya.com/contents/drink.html": "음료",
    "https://ediya.com/contents/bakery.html": "베이커리",
}
BASKIN_LIST = "https://www.baskinrobbins.co.kr/menu/list.php?top=A"
PARIS_LIST = "https://www.paris.co.kr/products/"


def number(value) -> float | None:
    match = re.search(r"\d+(?:\.\d+)?", str(value).replace(",", ""))
    return float(match.group()) if match else None


def normalize_allergens(value: str) -> str:
    value = str(value).replace("난류", "계란").replace("달걀", "계란")
    found = []
    for item in ["계란", "우유", "대두", "밀", "땅콩", "새우", "게", "돼지고기", "쇠고기", "닭고기", "토마토", "아황산류", "오징어", "조개류", "복숭아"]:
        if item in value and item not in found:
            found.append(item)
    return "|".join(found)


def mcdonalds() -> list[dict]:
    response = requests.get(MCD_URL, timeout=30)
    response.raise_for_status()
    rows = response.json()["resultObject"]["list"]
    result = []
    for row in rows:
        # 범위로만 제공되는 세트는 제외하되 `582.0` 같은 정상 단품 수치는 포함한다.
        calorie_text = str(row.get("calorie", "")).strip()
        if not re.fullmatch(r"\d+(?:\.\d+)?", calorie_text):
            continue
        facts = {}
        for part in str(row.get("nutritionFacts", "")).split(","):
            if ";" in part:
                key, value = part.split(";", 1)
                facts[key] = number(value)
        result.append({
            "brand": "맥도날드", "menu": row["menuName"], "category": row["menuGroup"],
            "calories": number(row["calorie"]), "protein": facts.get("단백질"),
            "fat": facts.get("포화지방"), "carbs": facts.get("당"), "sodium": facts.get("나트륨"),
            "allergens": normalize_allergens(row.get("allergyInfo", "")),
            "source_url": "https://www.mcdonalds.co.kr/kor/menu/information/nutrition",
            "source_date": row.get("modDate") or row.get("regDate"), "verified": True,
            "allergen_known": True,
        })
    return result


def lotteria() -> list[dict]:
    response = requests.get(LOTTE_URL, timeout=30)
    response.raise_for_status()
    response.encoding = "utf-8"
    soup = BeautifulSoup(response.text, "lxml")
    result = []
    category = ""
    for table_row in soup.select("tbody tr"):
        cells = [cell.get_text(" ", strip=True) for cell in table_row.find_all(["th", "td"], recursive=False)]
        # 단품 영양행은 10개 셀, 새 구분의 첫 행은 rowspan 구분 셀을 포함해 11개다.
        if len(cells) == 11:
            category, cells = cells[0], cells[1:]
        if len(cells) != 10:
            continue
        menu, allergy, _weight, kcal, protein, sodium, sugar, fat, _caffeine, _origin = cells
        calories = number(kcal)
        if not menu or calories is None or "~" in kcal:
            continue
        result.append({
            "brand": "롯데리아", "menu": menu, "category": category,
            "calories": calories, "protein": number(protein),
            "fat": number(fat), "carbs": number(sugar), "sodium": number(sodium),
            "allergens": normalize_allergens(allergy),
            "source_url": LOTTE_URL, "source_date": "2026-06-08", "verified": True,
            "allergen_known": True,
        })
    return result


def burgerking() -> list[dict]:
    message = {
        "header": {"result": True, "error_code": "", "error_text": "", "info_text": "",
                   "message_version": "", "login_session_id": "", "trcode": "BKR0347", "cd_call_chnn": "01"},
        "body": {},
    }
    response = requests.post(BURGERKING_URL, data={"message": __import__("json").dumps(message, separators=(",", ":"))}, timeout=30)
    response.raise_for_status()
    body = response.json()["body"]
    allergy_by_name = {row["menuNm"].strip(): row.get("allergyNm", "") for row in body["allAllergyList"]}
    result = []
    for row in body["allNutrientList"]:
        name = row["menuNm"].strip()
        result.append({
            "brand": "버거킹", "menu": name, "category": "공식 메뉴",
            "calories": number(row["calory"]), "protein": number(row["protein"]),
            "fat": number(row["satufat"]), "carbs": number(row["sugars"]),
            "sodium": number(row["natrium"]),
            "allergens": normalize_allergens(allergy_by_name.get(name, "")),
            "source_url": "https://www.burgerking.co.kr/menu/main",
            "source_date": date.today().isoformat(), "verified": True,
            "allergen_known": name in allergy_by_name,
        })
    return result


def starbucks() -> list[dict]:
    categories = {
        "W0000171": "콜드 브루", "W0000060": "브루드 커피", "W0000003": "에스프레소",
        "W0000004": "프라푸치노", "W0000005": "블렌디드", "W0000422": "리프레셔",
        "W0000061": "피지오", "W0000075": "티", "W0000053": "기타 음료", "W0000062": "병음료",
    }
    result, raw_rows = [], []
    for code, category in categories.items():
        response = requests.get(f"{STARBUCKS_BASE}{code}.js", timeout=30)
        response.raise_for_status()
        for row in response.json()["list"]:
            if row.get("sold_OUT") == "Y":
                continue
            raw_rows.append(row)
    def fetch_allergy(row: dict) -> tuple[str, str, str, bool]:
        product_cd = str(row.get("product_CD") or "")
        detail_url = f"https://www.starbucks.co.kr/menu/drink_view.do?product_cd={product_cd}"
        html = requests.get(detail_url, timeout=30).text
        match = re.search(r'"ALLERGY"\s*:\s*"((?:\\.|[^"\\])*)"', html)
        allergy = json.loads(f'"{match.group(1)}"') if match else ""
        return row["product_NM"].strip(), allergy, detail_url, match is not None
    with ThreadPoolExecutor(max_workers=10) as pool:
        allergies = {name: (allergy, url, known) for name, allergy, url, known in pool.map(fetch_allergy, raw_rows)}
    for code, category in categories.items():
        response = requests.get(f"{STARBUCKS_BASE}{code}.js", timeout=30)
        response.raise_for_status()
        for row in response.json()["list"]:
            if row.get("sold_OUT") == "Y":
                continue
            allergy, detail_url, known = allergies.get(row["product_NM"].strip(), ("", "", False))
            result.append({
                "brand": "스타벅스", "menu": row["product_NM"].strip(),
                # JSON 파일 자체가 공식 대분류별로 나뉘므로 세부 이름을 재추측하지 않는다.
                "category": category,
                "calories": number(row["kcal"]), "protein": number(row["protein"]),
                "fat": number(row["sat_FAT"]), "carbs": number(row["sugars"]),
                "sodium": number(row["sodium"]), "allergens": normalize_allergens(allergy),
                "source_url": detail_url or "https://www.starbucks.co.kr/menu/drink_list.do",
                "source_date": date.today().isoformat(), "verified": True,
                "image_url": requests.compat.urljoin(row.get("img_UPLOAD_PATH") or "https://www.starbucks.co.kr", row.get("file_PATH", "")),
                "description": re.sub(r"\s+", " ", BeautifulSoup(row.get("content") or "", "lxml").get_text(" ", strip=True)).strip(),
                "media_source_url": detail_url or "https://www.starbucks.co.kr/menu/drink_list.do",
                "media_checked_at": date.today().isoformat(),
                # 상세 페이지에 ALLERGY 필드가 존재하면 빈 값도 공식 '표시 없음'으로 구분한다.
                "allergen_known": known,
            })
    return result


def kfc() -> list[dict]:
    """KFC 공식 영양정보 API의 현재 공개 행 전체를 수집한다."""
    source = "https://www.kfckorea.com/menu/nutrition"
    allergy_source = "https://www.kfckorea.com/nas/kfcimg/info/info_allergy.png"
    # menu, category, kcal, protein, saturated fat, sugar, sodium, allergens
    rows = [
        ("오리지널치킨", "치킨", 271, 20, 4.2, 0, 544, "대두, 밀, 계란, 우유, 닭고기"),
        ("핫크리스피치킨", "치킨", 264, 22, 4.3, 0, 455, "대두, 밀, 닭고기"),
        ("갓양념치킨", "치킨", 261, 15, 3.5, 6, 504, "대두, 밀, 닭고기, 토마토, 쇠고기"),
        ("핫윙 2조각", "치킨", 182, 10, 3.9, 0, 445, "대두, 밀, 닭고기"),
        ("핫크리스피통다리", "치킨", 237, 13, 3.9, 0, 462, None),
        ("갓양념통다리", "치킨", 298, 14, 4.0, 8, 610, None),
        ("트러플치즈통다리", "치킨", 238, 15, 4.0, 6, 574, None),
        ("오리지널통다리", "치킨", 162, 13, 2.4, 0, 378, None),
        ("징거", "버거", 553, 33, 7.4, 5, 866, "대두, 밀, 계란, 우유, 닭고기"),
        ("징거타워", "버거", 720, 36, 11.0, 9, 1343, "대두, 밀, 계란, 우유, 닭고기, 토마토"),
        ("트위스터", "버거", 360, 18, 4.4, 4, 1334, "대두, 밀, 계란, 우유, 닭고기, 토마토"),
        ("징거BLT", "버거", 696, 39, 11.2, 6, 1146, "대두, 밀, 계란, 우유, 닭고기, 토마토, 돼지고기"),
        ("클래식징거통다리", "버거", 604, 24, 9.2, 12, 1010, "대두, 밀, 계란, 우유, 닭고기, 토마토"),
        ("치즈징거통다리", "버거", 713, 28, 15.1, 9, 1386, "대두, 밀, 계란, 우유, 닭고기"),
        ("칙플레맵징거통다리", "버거", 695, 24, 10.1, 18, 1125, "대두, 밀, 계란, 우유, 닭고기, 토마토"),
        ("칙플레맵징거타워", "버거", 803, 37, 11.8, 16, 1386, "대두, 밀, 계란, 우유, 닭고기, 토마토"),
        ("칙플레맵징거더블다운", "버거", 946, 46, 18.4, 6, 1626, "대두, 밀, 우유, 닭고기, 토마토, 돼지고기"),
        ("트위스터(범계역점)", "버거", 415, 20, 3.0, 5, 1517, None),
        ("프렌치프라이", "사이드", 144, 2, 1.0, 0, 366, "대두"),
        ("프렌치프라이(L)", "사이드", 204, 2, 1.0, 0, 568, None),
        ("에그타르트", "사이드", 215, 3, 8.5, 8, 105, "대두, 밀, 계란, 우유, 쇠고기"),
        ("코울슬로", "사이드", 139, 2, 1.9, 15, 190, ""),
        ("치킨너겟", "사이드", 44, 3, 0.9, 0, 196, None),
        ("트러플치즈프라이", "사이드", 256, 4, 3.0, 2, 516, None),
        ("텐더", "사이드", 72, 7, 0.9, 0, 279, None),
        ("버터갈릭라이스", "사이드", 405, 7, 2.0, 2, 427, None),
        ("텐더스틱", "사이드", 119, 8, 1.5, 0, 290, None),
        ("버터비스켓", "사이드", 300, 5, 13.1, 8, 342, None),
        ("해쉬브라운", "사이드", 107, 1, 1.6, 0, 203, None),
        ("매쉬포테이토&그레이비", "사이드", 163, 2, 6.0, 3, 424, None),
        ("치즈 추가", "추가 메뉴", 43, 2, 2.1, 0, 147, None),
        ("베이컨 추가", "추가 메뉴", 37, 3, 0.9, 0, 95, None),
        ("가슴살 필렛", "추가 메뉴", 297, 29, 4.3, 1, 621, None),
        ("다리살 필렛", "추가 메뉴", 346, 20, 6.7, 0, 537, None),
        ("토마토 추가", "추가 메뉴", 10, 0, 0, 0, 9, None),
        ("아메리카노", "음료", 7, 0, 0, 0, 3, ""),
    ]
    known_allergens = {menu: allergens for menu, _category, _kcal, _protein, _fat, _sugar, _sodium, allergens in rows}
    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0", "Referer": source})
    csrf = session.get("https://www.kfckorea.com/kfc/interface/session", timeout=30).json()["csrf"]
    session.headers[csrf["headerName"]] = csrf["token"]
    response = session.post(
        "https://www.kfckorea.com/admin/interface/selectnutritionList",
        data={"search_nutrition_show_yn": "Y", "device": "WEB", "search_order": "nutrition_show"},
        timeout=30,
    )
    response.raise_for_status()
    official_rows = response.json().get("rows", [])
    result = []
    for row in official_rows:
        menu = str(row.get("nutrition_nm", "")).strip()
        calorie_text = str(row.get("nutrition_calory", "")).strip()
        # 조합에 따라 값이 달라지는 범위형 세트는 단일 영양값으로 오해될 수 있어 제외한다.
        if not menu or not re.fullmatch(r"[\d,.]+", calorie_text):
            continue
        allergens = known_allergens.get(menu)
        result.append({
            "brand": "KFC", "menu": menu,
            "category": str(row.get("nutrition_type_nm") or "기타").strip(),
            "calories": number(calorie_text), "protein": number(row.get("nutrition_protein")),
            "fat": number(row.get("nutrition_saturated_fat")), "carbs": number(row.get("nutrition_sugars")),
            "sodium": number(row.get("nutrition_salt")), "allergens": normalize_allergens(allergens or ""),
            "source_url": source, "source_date": date.today().isoformat(), "verified": True,
            "allergen_known": allergens is not None, "allergy_source_url": allergy_source,
        })
    if result:
        return result
    # 공식 API 장애 시 마지막으로 확인한 표의 최소 데이터로 폴백한다.
    for menu, category, kcal, protein, fat, sugar, sodium, allergens in rows:
        result.append({"brand": "KFC", "menu": menu, "category": category, "calories": kcal,
                       "protein": protein, "fat": fat, "carbs": sugar, "sodium": sodium,
                       "allergens": normalize_allergens(allergens or ""), "source_url": source,
                       "source_date": "2026-07-21", "verified": True,
                       "allergen_known": allergens is not None,
                       "allergy_source_url": allergy_source})
    return result


def subway() -> list[dict]:
    sections = {
        "sandwich": "샌드위치(기본 레시피)", "grain_salad": "그레인 샐러드",
        "salad": "샐러드", "morning": "아침메뉴", "sidedrink": "사이드·음료",
        "unit": "랩·기타",
    }
    items = {}
    for route, category_name in sections.items():
        list_url = f"https://www.subway.co.kr/menuList/{route}"
        response = requests.get(list_url, timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "lxml")
        for link in soup.select("a[data-menuitemidx]"):
            card = link.find_parent("li")
            name = card.select_one("strong.tit") if card else None
            if name:
                items[(link.get("data-category") or route, link["data-menuitemidx"])] = (name.get_text(strip=True), category_name)
    # 써브웨이 공식 알레르기 표: ●(함유)와 ★(혼입 가능)를 모두 위험 성분으로 반영한다.
    labels = ["계란", "우유", "메밀", "땅콩", "대두", "밀", "고등어", "게", "새우", "돼지고기", "복숭아", "토마토", "아황산류", "호두", "닭고기", "쇠고기", "오징어", "조개류", "잣"]
    patterns = {
        "비엘티": "XX..XX...X.X.......", "치킨데리야끼": "XX..XX.....X..X....", "에그마요": "XX..XX.....X.....X.",
        "이탈리안비엠티": "XX..XX...X.X.......", "풀드포크바비큐": "XX..XX...X.X.......", "로스트치킨": "XX..XX.....X..XX...",
        "로티세리바비큐치킨": "XX..XX.....X..X....", "쉬림프": "XX..XX..X..X.......", "스파이시이탈리안": "XX..XX...X.X.......",
        "스테이크치즈": "XX..XX.....X...X...", "써브웨이클럽": "XX..XX...X.XX......", "베지": "XX..XX.....X.......",
        "참치": "XX..XX.....X.......", "치킨슬라이스": "XX..XX.....X..X....", "치킨베이컨아보카도": "XX..XX...X.X..X....",
        "스파이시쉬림프": "XX..XX..X..X.......", "에그슬라이스": "XX..XX.....X.......", "안창비프": "XX..XX.....X...X...",
        "안창비프머쉬룸": "XX..XX.....X...X...", "머쉬룸": "X.XXXXXXXXXXXXXXXXX", "피자썹": "X.XXXXXXXXXXXXX.XXX",
        "잠봉": "XXXXXXXXXXXXXXXXXXX", "잠봉플러스": "XXXXXXXXXXXXXXXXXXX", "로스트치킨아보카도": "....XX.....X..XX...",
    }
    allergy_source = "https://www.subway.co.kr/sandwichAllergy"
    result = []
    for (route, item_id), (fallback_name, category_name) in items.items():
        detail_url = f"https://www.subway.co.kr/menuView/{route}?menuItemIdx={item_id}"
        try:
            detail = requests.get(detail_url, timeout=30)
            detail.raise_for_status()
        except requests.RequestException:
            continue
        page = BeautifulSoup(detail.text, "lxml")
        name_tag = page.select_one("h2.name")
        table = page.select_one("div.board_list_wrapper table")
        if table is None:
            continue
        values = [number(cell.get_text(" ", strip=True)) for cell in table.select("tbody tr:first-child td")]
        if len(values) < 6:
            continue
        _, kcal, protein, fat, sugar, sodium = values[:6]
        menu_name = name_tag.get_text(strip=True) if name_tag else fallback_name
        menu_key = re.sub(r"[^0-9A-Za-z가-힣]", "", menu_name).lower()
        pattern = patterns.get(menu_key)
        allergens = "|".join(label for label, mark in zip(labels, pattern or "") if mark == "X")
        result.append({"brand": "써브웨이", "menu": menu_name,
                       "category": category_name, "calories": kcal, "protein": protein,
                       "fat": fat, "carbs": sugar, "sodium": sodium, "allergens": allergens,
                       "source_url": detail_url, "source_date": date.today().isoformat(),
                       "verified": True, "allergen_known": pattern is not None,
                       "allergy_source_url": allergy_source if pattern else ""})
    return result


def ediya() -> list[dict]:
    """이디야 공식 메뉴 상세 레이어에 공개된 영양·알레르기 정보를 수집한다."""
    result = []
    for url, category in EDIYA_PAGES.items():
        product_cate = 7 if category == "음료" else 8
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        documents = [response.text]
        # 첫 화면에는 일부 상품만 들어 있고 나머지는 공식 '더보기' AJAX로 제공된다.
        for page_number in range(2, 100):
            more = requests.get(
                "https://ediya.com/inc/ajax_brand.php",
                params={"gubun": "menu_more", "product_cate": product_cate,
                        "chked_val": "", "skeyword": "", "page": page_number},
                timeout=30,
            )
            more.raise_for_status()
            if more.text.strip().lower() in {"", "none"}:
                break
            documents.append(more.text)
        for document in documents:
            soup = BeautifulSoup(document, "lxml")
            for detail in soup.select(".pro_detail"):
                title = detail.select_one("h2")
                nutrients = {
                    dl.select_one("dt").get_text(strip=True): number(dl.select_one("dd").get_text(strip=True))
                    for dl in detail.select(".pro_nutri dl") if dl.select_one("dt") and dl.select_one("dd")
                }
            # new_pro_detail은 실제 상품이 아니라 예시값이 들어간 숨김 템플릿이다.
                if not title or detail.get("id") == "new_pro_detail" or nutrients.get("칼로리") is None:
                    continue
                allergy_tag = detail.select_one(".pro_allergy")
                allergy = allergy_tag.get_text(" ", strip=True) if allergy_tag else ""
                result.append({
                    "brand": "이디야", "menu": title.contents[0].strip(), "category": category,
                    "calories": nutrients.get("칼로리"), "protein": nutrients.get("단백질"),
                    "fat": nutrients.get("포화지방"), "carbs": nutrients.get("당류"),
                    "sodium": nutrients.get("나트륨"), "allergens": normalize_allergens(allergy),
                    "source_url": url, "source_date": date.today().isoformat(), "verified": True,
                    "allergen_known": bool(allergy_tag),
                })
    return result


def baskin_robbins() -> list[dict]:
    """배스킨라빈스 공식 아이스크림 목록과 상세 영양표를 결합한다."""
    response = requests.get(BASKIN_LIST, timeout=30)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "lxml")
    result = []
    for link in soup.select("a.menu-list__link"):
        detail_url = requests.compat.urljoin(BASKIN_LIST, link.get("href", ""))
        page_response = requests.get(detail_url, timeout=30)
        page_response.raise_for_status()
        page = BeautifulSoup(page_response.text, "lxml")
        text = page.get_text(" ", strip=True)
        pattern = (r"영양정보\s+1회 제공량\(g\)\s+[\d.]+\s+열량\(kcal\)\s+([\d.]+)\s+"
                   r"당류\(g\)\s+([\d.]+)\s+단백질\(g\)\s+([\d.]+)\s+포화지방\(g\)\s+([\d.]+)\s+"
                   r"나트륨\(mg\)\s+([\d.]+)\s+※\s*알레르기 성분\s+(.*?)\s+SELECT SIZE")
        match = re.search(pattern, text)
        if not match:
            continue
        kcal, sugar, protein, fat, sodium, allergy = match.groups()
        image = link.select_one("img[alt]")
        title = image.get("alt", "").strip() if image else ""
        if not title:
            continue
        result.append({
            "brand": "배스킨라빈스", "menu": title, "category": "아이스크림",
            "calories": number(kcal), "protein": number(protein), "fat": number(fat),
            "carbs": number(sugar), "sodium": number(sodium),
            "allergens": normalize_allergens(allergy), "source_url": detail_url,
            "source_date": date.today().isoformat(), "verified": True, "allergen_known": True,
            "price": 3900, "price_note": "싱글레귤러 115g 공식 표시가",
            "price_source_url": detail_url, "price_checked_at": date.today().isoformat(),
        })
    return result


def paris_baguette() -> list[dict]:
    """파리바게뜨 공식 상품 사이트맵의 상세 영양정보를 수집한다."""
    sitemap_url = "https://www.paris.co.kr/product-sitemap.xml"
    response = requests.get(sitemap_url, timeout=30)
    response.raise_for_status()
    sitemap = BeautifulSoup(response.text, "xml")
    links = sorted({loc.get_text(strip=True) for loc in sitemap.select("url > loc")
                    if "/product/" in loc.get_text(strip=True)})

    def fetch_detail(detail_url: str) -> dict | None:
        try:
            page_response = requests.get(detail_url, timeout=30)
            page_response.raise_for_status()
        except requests.RequestException:
            return None
        page = BeautifulSoup(page_response.text, "lxml")
        text = page.get_text(" ", strip=True)
        pattern = (r"영양정보\s+총 내용량:.*?총 내용량당 칼로리\(kcal\):\s*([\d,.]+).*?"
                   r"나트륨\(mg\):\s*([\d,.]+).*?당류\(g\):\s*([\d,.]+).*?"
                   r"포화지방\(g\):\s*([\d,.]+).*?단백질\(g\):\s*([\d,.]+).*?"
                   r"알레르기 정보\s+(.*?)\s+추가정보")
        match = re.search(pattern, text)
        if not match:
            return None
        kcal, sodium, sugar, fat, protein, allergy = match.groups()
        # 첫 h1은 공통 브랜드명이므로 상세 영역의 첫 product-name을 사용한다.
        heading = page.select_one(".product-name")
        if not heading:
            return None
        menu = heading.get_text(" ", strip=True)
        category_links = page.select('a[href*="/products/?cat1="]')
        raw_category = "기타"
        if category_links:
            category_url = requests.compat.urljoin(detail_url, category_links[-1].get("href", ""))
            raw_category = parse_qs(urlparse(category_url).query).get("cat1", ["기타"])[0]
        category = {"브레드": "빵", "샌드위치-샐러드": "샌드위치·샐러드",
                    "디저트-스낵": "디저트·스낵", "커피-음료": "음료",
                    "퍼스트클래스키친": "간편식"}.get(raw_category, raw_category)
        image_tag = page.select_one('meta[property="og:image"]')
        excerpt = page.select_one(".excerpt")
        return {
            "brand": "파리바게뜨", "menu": menu, "category": category,
            "calories": number(kcal), "protein": number(protein), "fat": number(fat),
            "carbs": number(sugar), "sodium": number(sodium),
            "allergens": normalize_allergens(allergy), "source_url": detail_url,
            "source_date": date.today().isoformat(), "verified": True, "allergen_known": True,
            "image_url": image_tag.get("content", "") if image_tag else "",
            "description": excerpt.get_text(" ", strip=True) if excerpt else "",
            "media_source_url": detail_url, "media_checked_at": date.today().isoformat(),
        }

    with ThreadPoolExecutor(max_workers=12) as pool:
        return [row for row in pool.map(fetch_detail, links) if row is not None]


if __name__ == "__main__":
    frame = pd.DataFrame(mcdonalds() + lotteria() + burgerking() + starbucks() + kfc() + subway()
                         + ediya() + baskin_robbins() + paris_baguette())
    frame = frame.dropna(subset=["calories", "protein", "sodium"]).drop_duplicates(["brand", "menu"])
    # 사진·설명·가격 보강값은 영양정보 갱신 때 지우지 않는다. 브랜드/메뉴 원문을 안정 키로 사용한다.
    if OUT.exists():
        previous = pd.read_csv(OUT).fillna("")
        preserved = ["image_url", "description", "media_source_url", "media_checked_at",
                     "price", "price_note", "price_source_url", "price_checked_at"]
        old = previous[["brand", "menu"] + [column for column in preserved if column in previous]].drop_duplicates(["brand", "menu"])
        frame = frame.merge(old, on=["brand", "menu"], how="left", suffixes=("", "_old"))
        for column in preserved:
            old_column = f"{column}_old"
            if old_column not in frame:
                continue
            if column not in frame:
                frame[column] = frame[old_column]
            else:
                frame[column] = frame[column].astype(object)
                empty = frame[column].isna() | frame[column].astype(str).eq("")
                frame.loc[empty, column] = frame.loc[empty, old_column]
            frame = frame.drop(columns=[old_column])
    frame.to_csv(OUT, index=False, encoding="utf-8")
    print(f"saved {len(frame)} verified menu rows -> {OUT}")
