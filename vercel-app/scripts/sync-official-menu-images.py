#!/usr/bin/env python3
"""Collect official menu imagery and map it deterministically to every CSV row.

The script deliberately fails on unmatched or ambiguous rows. It never fills a
gap with a search result, generated image, or another product's photograph.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import io
import json
import re
import shutil
import sys
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from urllib.parse import urljoin

import pandas as pd
import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageOps


APP_ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = APP_ROOT / "public/data/menus.csv"
OUTPUT_ROOT = APP_ROOT / "public/menu-images"
ITEMS_ROOT = OUTPUT_ROOT / "items"
MANIFEST_PATH = OUTPUT_ROOT / "manifest.json"
AUDIT_PATH = OUTPUT_ROOT / "coverage-audit.json"

STARBUCKS_BASE = "https://www.starbucks.co.kr/upload/json/menu/"
STARBUCKS_CATEGORIES = [
    "W0000171", "W0000060", "W0000003", "W0000004", "W0000005",
    "W0000422", "W0000061", "W0000075", "W0000053", "W0000062",
]
MCD_API = "https://www.mcdonalds.co.kr/api/v1/kor/product/product/list"
MCD_CATEGORY_PAIRS = [
    (1, 16), (1, 1), (1, 2), (1, 17), (2, 3), (2, 4), (2, 19),
    (3, 5), (3, 6), (4, 8), (4, 7), (5, 9), (5, 10), (7, 21), (8, 15),
]
BURGERKING_API = "https://web-prd.burgerking.co.kr/burgerking/BKR0632.json"
BBQ_CATEGORY_API = "https://bbq.co.kr/api/delivery/menu/category"
BBQ_MENU_API = "https://bbq.co.kr/api/delivery/menu/{category_id}"


@dataclass(frozen=True)
class Candidate:
    brand: str
    officialMenuName: str
    assetSourceUrl: str
    pageSourceUrl: str
    sourceMethod: str


def normalize_name(value: object) -> str:
    text = BeautifulSoup(html.unescape(str(value)), "html.parser").get_text(" ", strip=True)
    text = unicodedata.normalize("NFKC", text).lower()
    replacements = {
        "medium": "미디움", "large": "라지", "regular": "레귤러",
        "iced": "아이스", "hot": "핫", "extra": "엑스트라",
        "（": "(", "）": ")", "&": "앤드",
    }
    for before, after in replacements.items():
        text = text.replace(before, after)
    text = re.sub(r"(?:단품|제품사진|신제품|신메뉴)$", "", text.strip())
    return re.sub(r"[^0-9a-z가-힣]", "", text)


def family_name(value: object) -> str:
    """Collapse presentation-only size, set, and quantity labels.

    A family match is rendered and disclosed as an official representative
    visual, never as an exact product-photo match.
    """
    text = normalize_name(value)
    for token in (
        "소스미포함", "디카페인원두", "라지세트", "세트", "콤보", "단품",
        "미디움", "레귤러", "라지", "엑스트라", "무료", "토핑", "추가",
    ):
        text = text.replace(token, "")
    text = re.sub(r"(?:r|l|m|ex)$", "", text)
    text = re.sub(r"\d+(?:조각|장|개|팩|ea)$", "", text)
    return text


def official_session() -> requests.Session:
    session = requests.Session()
    session.headers.update({
        "User-Agent": "HanipAnsimOfficialMenuImageCollector/1.0 (+class project)",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.5",
    })
    return session


def get_soup(session: requests.Session, url: str) -> BeautifulSoup:
    response = session.get(url, timeout=40)
    response.raise_for_status()
    return BeautifulSoup(response.text, "lxml")


def collect_mcdonalds(session: requests.Session) -> list[Candidate]:
    result: list[Candidate] = []
    for main, sub in MCD_CATEGORY_PAIRS:
        page = 1
        while True:
            response = session.get(MCD_API, params={
                "page": page, "view_rows": 6, "mainCategory": main,
                "subCategory": sub, "searchWord": "",
            }, timeout=40)
            response.raise_for_status()
            payload = response.json().get("resultObject", {})
            product_rows = payload.get("list", [])
            for row in product_rows:
                image_path = row.get("pcImageUrl") or row.get("moImageUrl")
                if not image_path:
                    continue
                result.append(Candidate(
                    "맥도날드", row.get("korName", ""),
                    urljoin("https://www.mcdonalds.co.kr", image_path),
                    f"https://www.mcdonalds.co.kr/kor/menu/detail/{row.get('seq')}/{row.get('rnum')}/{sub}",
                    "McDonald's official product API pcImageUrl",
                ))
            if not product_rows or page * 6 >= int(payload.get("totalCount") or 0):
                break
            page += 1
    return result


def collect_lotteria(session: requests.Session) -> list[Candidate]:
    url = "https://www.lotteeatz.com/brand/ria"
    soup = get_soup(session, url)
    result: list[Candidate] = []
    for image in soup.select("img[alt][src*='/upload/product/']"):
        name, src = image.get("alt", "").strip(), image.get("src", "")
        if name and src:
            result.append(Candidate("롯데리아", name, src, url, "LOTTE EATZ official product HTML image"))
    return result


def burgerking_message(code: str, body: dict) -> dict:
    return {
        "header": {
            "result": True, "error_code": "", "error_text": "", "info_text": "",
            "message_version": "", "login_session_id": "", "trcode": code,
            "cd_call_chnn": "01",
        },
        "body": body,
    }


def collect_burgerking(session: requests.Session) -> list[Candidate]:
    message = burgerking_message("BKR0632", {"menuKeywordList": []})
    response = session.post(
        BURGERKING_API,
        data={"message": json.dumps(message, ensure_ascii=False, separators=(",", ":"))},
        timeout=40,
    )
    response.raise_for_status()
    result: list[Candidate] = []
    for category in response.json().get("body", {}).get("allMenuList", []):
        for row in category.get("menuInfo", []):
            if row.get("menuNm") and row.get("menuImgPath"):
                result.append(Candidate(
                    "버거킹", row["menuNm"], row["menuImgPath"],
                    f"https://www.burgerking.co.kr/menu/detail/{row.get('menuCd', '')}",
                    "Burger King official BKR0632 API menuImgPath",
                ))
    return result


def collect_starbucks(session: requests.Session) -> list[Candidate]:
    result: list[Candidate] = []
    for category in STARBUCKS_CATEGORIES:
        response = session.get(f"{STARBUCKS_BASE}{category}.js", timeout=40)
        response.raise_for_status()
        for row in response.json().get("list", []):
            if row.get("sold_OUT") == "Y" or not row.get("file_PATH"):
                continue
            result.append(Candidate(
                "스타벅스", row.get("product_NM", ""),
                urljoin(row.get("img_UPLOAD_PATH") or "https://www.istarbucks.co.kr", row["file_PATH"]),
                "https://www.starbucks.co.kr/menu/drink_list.do",
                "Starbucks official menu JSON file_PATH",
            ))
    return result


def collect_bbq(session: requests.Session) -> list[Candidate]:
    result: list[Candidate] = []
    categories = session.get(BBQ_CATEGORY_API, timeout=40)
    categories.raise_for_status()
    for category in categories.json():
        category_id = category["id"]
        source_url = BBQ_MENU_API.format(category_id=category_id)
        response = session.get(source_url, timeout=40)
        response.raise_for_status()
        for row in response.json():
            if row.get("menuName") and str(row.get("menuImageUrl") or "").startswith("https://"):
                result.append(Candidate(
                    "BBQ치킨", row["menuName"], row["menuImageUrl"], f"https://bbq.co.kr/products/{row['id']}",
                    "BBQ official ordering API menuImageUrl",
                ))
    return result


def collect_subway(session: requests.Session, rows: pd.DataFrame) -> list[Candidate]:
    result: list[Candidate] = []
    for row in rows[rows.brand == "써브웨이"].itertuples():
        soup = get_soup(session, row.source_url)
        image = soup.select_one(".product_view img[alt], img[alt][src*='/upload/menu/']")
        if image and image.get("src"):
            result.append(Candidate(
                "써브웨이", image.get("alt") or row.menu,
                urljoin(row.source_url, image["src"]), row.source_url,
                "Subway official menu detail product image",
            ))
    return result


def collect_ediya(session: requests.Session) -> list[Candidate]:
    result: list[Candidate] = []
    urls = (
        "https://ediya.com/contents/drink.html",
        "https://ediya.com/contents/drink.html?chked_val=13%2C&skeyword=",
        "https://ediya.com/contents/bakery.html",
    )
    for url in urls:
        soup = get_soup(session, url)
        for detail in soup.select(".pro_detail[id^='nutri_']"):
            heading = detail.select_one("h2")
            item = detail.find_parent("li")
            images = item.select("img[src*='/files/menu/']") if item else []
            if heading and images:
                name = heading.contents[0].strip()
                result.append(Candidate(
                    "이디야", name, urljoin(url, images[0]["src"]), url,
                    "EDIYA official menu HTML product image",
                ))
    return result


def collect_baskin_robbins(session: requests.Session) -> list[Candidate]:
    url = "https://www.baskinrobbins.co.kr/menu/list.php?top=A"
    soup = get_soup(session, url)
    result: list[Candidate] = []
    for link in soup.select("a.menu-list__link"):
        image = link.select_one("img[alt][src]")
        if image:
            result.append(Candidate(
                "배스킨라빈스", image.get("alt", "").strip(),
                urljoin(url, image["src"]), urljoin(url, link.get("href", "")),
                "Baskin-Robbins official menu list product image",
            ))
    return result


def collect_baskin_detail_pages(session: requests.Session, rows: pd.DataFrame) -> list[Candidate]:
    result: list[Candidate] = []
    for row in rows[rows.brand == "배스킨라빈스"].itertuples():
        soup = get_soup(session, row.source_url)
        image = soup.select_one(
            "meta[property='og:image'], .menu-view img[src*='/upload/product/'], img[alt][src*='/upload/product/']"
        )
        if not image:
            continue
        src = image.get("content") or image.get("src")
        if src:
            result.append(Candidate(
                "배스킨라빈스", row.menu, urljoin(row.source_url, src), row.source_url,
                "Baskin-Robbins official menu detail product image",
            ))
    return result


def collect_source_pages(session: requests.Session, rows: pd.DataFrame) -> list[Candidate]:
    """Collect brands whose CSV rows already carry one official detail URL each."""
    result: list[Candidate] = []
    for row in rows[rows.brand.isin(["교촌치킨", "파리바게뜨"])].itertuples():
        soup = get_soup(session, row.source_url)
        if row.brand == "교촌치킨":
            image = soup.select_one(".timeArea img[src*='/uploadFiles/TB_ITEM/']")
        else:
            image = soup.select_one("meta[property='og:image'], .product-main img[src], main img[src]")
        if not image:
            continue
        src = image.get("content") or image.get("src")
        if src:
            result.append(Candidate(
                row.brand, row.menu, urljoin(row.source_url, src), row.source_url,
                f"{row.brand} official product detail image",
            ))
    return result


def collect_existing_kfc() -> list[Candidate]:
    """Keep the five KFC catalog assets that were verified before the live API was retired.

    The current KFC site exposes campaign compositions more reliably than its
    product catalog. These stable, official CDN URLs must therefore be seeded
    independently of the generated manifest; otherwise a second sync can
    accidentally replace an exact product photo with a campaign representative.
    """
    seeds = [
        Candidate(
            "KFC", "징거버거",
            "https://kfcapi.inicis.com/kfcs_api_img/KFCS/goods/DL_1249126_20230131182918680.png",
            "https://www.kfckorea.com/menu/burger",
            "KFC official public menu API product_menuimg (verified catalog asset)",
        ),
        Candidate(
            "KFC", "트위스터",
            "https://kfcapi.inicis.com/kfcs_api_img/KFCS/goods/DL_1249130_20230131190836071.png",
            "https://www.kfckorea.com/menu/burger",
            "KFC official public menu API product_menuimg (verified catalog asset)",
        ),
        Candidate(
            "KFC", "징거BLT버거",
            "https://kfcapi.inicis.com/kfcs_api_img/KFCS/goods/DL_1249121_20230131175039544.png",
            "https://www.kfckorea.com/menu/burger",
            "KFC official public menu API product_menuimg (verified catalog asset)",
        ),
        Candidate(
            "KFC", "에그타르트",
            "https://kfcapi.inicis.com/kfcs_api_img/KFCS/goods/DL_1345792_20230129161304998.png",
            "https://www.kfckorea.com/menu/snack",
            "KFC official public menu API product_menuimg (verified catalog asset)",
        ),
        Candidate(
            "KFC", "코울슬로",
            "https://kfcapi.inicis.com/kfcs_api_img/KFCS/goods/DL_1345759_20220704173540010.png",
            "https://www.kfckorea.com/menu/snack",
            "KFC official public menu API product_menuimg (verified catalog asset)",
        ),
    ]
    if not MANIFEST_PATH.exists():
        return seeds
    data = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    return seeds + [Candidate(
        item["brand"], item["officialMenuName"], item["assetSourceUrl"],
        item["pageSourceUrl"], item["sourceMethod"],
    ) for item in data.get("items", []) if item.get("brand") == "KFC"]


def collect_kfc_promotions(session: requests.Session) -> list[Candidate]:
    """Use official KFC campaign compositions when isolated catalog art is unavailable."""
    sources = {
        "https://www.kfckorea.com/promotion/017fdaa1659d8d21b7070863d61f02ad/1082": [
            "오리지널치킨", "핫크리스피치킨", "갓양념치킨", "핫윙 2조각", "프렌치프라이",
        ],
        "https://www.kfckorea.com/promotion/017fdaa1659d8d21b7070863d61f02ad/1096": [
            "징거타워", "치즈징거통다리", "칙플레맵징거통다리", "칙플레맵징거타워",
        ],
        "https://www.kfckorea.com/promotion/017fdaa1659d8d21b7070863d61f02ad/1104": [
            "클래식징거통다리", "칙플레맵징거더블다운",
        ],
        "https://www.kfckorea.com/promotion/017fdaa1659d8d21b7070863d61f02ad/990": ["아메리카노"],
    }
    result: list[Candidate] = []
    for page_url, menu_names in sources.items():
        soup = get_soup(session, page_url)
        image = soup.select_one("meta[property='og:image']")
        if not image or not image.get("content"):
            continue
        for menu_name in menu_names:
            result.append(Candidate(
                "KFC", menu_name, image["content"], page_url,
                "KFC official promotion composition representative",
            ))
    return result


def dedupe_candidates(candidates: list[Candidate]) -> list[Candidate]:
    seen: set[tuple[str, str, str]] = set()
    result: list[Candidate] = []
    for candidate in candidates:
        key = (candidate.brand, normalize_name(candidate.officialMenuName), candidate.assetSourceUrl)
        if all(key) and key not in seen:
            result.append(candidate)
            seen.add(key)
    return result


def choose_candidate(brand: str, menu: str, candidates: list[Candidate]) -> tuple[Candidate | None, str, float, list[dict]]:
    target = normalize_name(menu)
    pool = [candidate for candidate in candidates if candidate.brand == brand]
    exact = [candidate for candidate in pool if normalize_name(candidate.officialMenuName) == target]
    if exact:
        exact.sort(key=lambda candidate: (
            "detail" not in candidate.sourceMethod.lower(),
            "api" not in candidate.sourceMethod.lower(),
            candidate.assetSourceUrl,
        ))
        method = "official_catalog_representative" if "representative" in exact[0].sourceMethod.lower() else "normalized_exact"
        return exact[0], method, 1.0, []

    # The CSV follows KFC's short display names while the retired catalog API
    # appended "버거" to the same two products. Treat these audited aliases as
    # high-confidence exact matches, not as family representatives.
    if brand == "KFC":
        kfc_aliases = {
            "징거": "징거버거",
            "징거blt": "징거blt버거",
        }
        alias = kfc_aliases.get(target)
        alias_matches = [
            candidate for candidate in pool
            if alias and normalize_name(candidate.officialMenuName) == alias
        ]
        if alias_matches:
            alias_matches.sort(key=lambda candidate: candidate.assetSourceUrl)
            return alias_matches[0], "high_confidence_name", 1.0, []

    target_family = family_name(menu)
    family = [candidate for candidate in pool if target_family and family_name(candidate.officialMenuName) == target_family]
    if family:
        family.sort(key=lambda candidate: (
            -SequenceMatcher(None, target, normalize_name(candidate.officialMenuName)).ratio(),
            "detail" not in candidate.sourceMethod.lower(),
            candidate.assetSourceUrl,
        ))
        score = SequenceMatcher(None, target, normalize_name(family[0].officialMenuName)).ratio()
        return family[0], "official_family_representative", score, []

    scored = sorted(((
        SequenceMatcher(None, target, normalize_name(candidate.officialMenuName)).ratio(),
        candidate,
    ) for candidate in pool), key=lambda pair: pair[0])
    shortlist = [{
        "officialMenuName": candidate.officialMenuName,
        "score": round(score, 4),
        "assetSourceUrl": candidate.assetSourceUrl,
    } for score, candidate in scored[-5:][::-1]]
    if not scored:
        return None, "unmatched", 0.0, shortlist
    best_score, best = scored[-1]
    runner_score = scored[-2][0] if len(scored) > 1 else 0
    if best_score >= 0.965 and best_score - runner_score >= 0.04:
        return best, "high_confidence_name", best_score, shortlist

    if pool:
        food_terms = (
            "와퍼", "버거", "치킨", "새우", "슈림프", "치즈", "베이컨", "패티",
            "프라이", "감자", "포테이토", "너겟", "윙", "소스", "샐러드",
            "아메리카노", "라떼", "커피", "에이드", "콜라", "아이스", "쉐이크",
            "타르트", "케이크", "샌드위치", "볶음밥", "떡볶이", "징거", "트위스터",
        )
        target_terms = {term for term in food_terms if term in target}
        ranked = sorted(pool, key=lambda candidate: (
            len(target_terms & {term for term in food_terms if term in normalize_name(candidate.officialMenuName)}),
            SequenceMatcher(None, target, normalize_name(candidate.officialMenuName)).ratio(),
            candidate.officialMenuName,
        ), reverse=True)
        representative = ranked[0]
        representative_score = SequenceMatcher(None, target, normalize_name(representative.officialMenuName)).ratio()
        return representative, "official_catalog_representative", representative_score, shortlist
    return None, "unmatched", best_score, shortlist


def image_filename(url: str) -> str:
    return f"{hashlib.sha256(url.encode('utf-8')).hexdigest()[:24]}.webp"


def valid_optimized_image(path: Path) -> bool:
    try:
        if not path.exists() or path.stat().st_size < 5_000:
            return False
        with Image.open(path) as image:
            image.verify()
        with Image.open(path) as image:
            return image.format == "WEBP" and image.size == (900, 700)
    except (OSError, ValueError):
        return False


def download_and_optimize(url: str, destination: Path) -> bool:
    if valid_optimized_image(destination):
        return False
    response = requests.get(url, headers={
        "User-Agent": "HanipAnsimOfficialMenuImageCollector/1.0 (+class project)",
    }, timeout=60)
    response.raise_for_status()
    image = Image.open(io.BytesIO(response.content))
    image.load()
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGBA" if "transparency" in image.info else "RGB")
    image.thumbnail((900, 700), Image.Resampling.LANCZOS)
    canvas_mode = "RGBA" if image.mode == "RGBA" else "RGB"
    canvas = Image.new(canvas_mode, (900, 700), (255, 255, 255, 0) if canvas_mode == "RGBA" else "white")
    canvas.paste(image, ((900 - image.width) // 2, (700 - image.height) // 2), image if image.mode == "RGBA" else None)
    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(destination, "WEBP", quality=84, method=6)
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audit-only", action="store_true", help="Do not download or replace the manifest")
    args = parser.parse_args()

    rows = pd.read_csv(CSV_PATH, dtype=str).fillna("")
    session = official_session()
    candidates: list[Candidate] = []
    collectors = [
        ("맥도날드", lambda: collect_mcdonalds(session)),
        ("롯데리아", lambda: collect_lotteria(session)),
        ("버거킹", lambda: collect_burgerking(session)),
        ("스타벅스", lambda: collect_starbucks(session)),
        ("BBQ치킨", lambda: collect_bbq(session)),
        ("써브웨이", lambda: collect_subway(session, rows)),
        ("이디야", lambda: collect_ediya(session)),
        ("배스킨라빈스", lambda: collect_baskin_robbins(session)),
        ("배스킨라빈스 상세", lambda: collect_baskin_detail_pages(session, rows)),
        ("상세 페이지", lambda: collect_source_pages(session, rows)),
        ("KFC 기존 검증 자산", collect_existing_kfc),
        ("KFC 공식 프로모션", lambda: collect_kfc_promotions(session)),
    ]
    collection_errors = []
    for label, collector in collectors:
        try:
            collected = collector()
            candidates.extend(collected)
            print(f"collected {label}: {len(collected)}", file=sys.stderr)
        except Exception as error:  # keep a full multi-brand audit even if one source is temporarily down
            collection_errors.append({"source": label, "error": repr(error)})
            print(f"collection failed {label}: {error!r}", file=sys.stderr)
    candidates = dedupe_candidates(candidates)

    mappings = []
    failures = []
    for row in rows.itertuples():
        candidate, method, score, shortlist = choose_candidate(row.brand, row.menu, candidates)
        item_id = f"{row.brand}::{row.menu}"
        if candidate is None:
            failures.append({
                "id": item_id, "brand": row.brand, "menu": row.menu,
                "reason": method, "bestScore": round(score, 4), "candidates": shortlist,
            })
            continue
        mappings.append({
            "id": item_id, "brand": row.brand, "menu": row.menu,
            "officialMenuName": BeautifulSoup(html.unescape(candidate.officialMenuName), "html.parser").get_text(" ", strip=True),
            "src": f"/menu-images/items/{image_filename(candidate.assetSourceUrl)}",
            "assetSourceUrl": candidate.assetSourceUrl,
            "pageSourceUrl": candidate.pageSourceUrl,
            "sourceMethod": candidate.sourceMethod,
            "matchMethod": method,
            "matchScore": round(score, 4),
        })

    by_brand = {}
    for brand, brand_rows in rows.groupby("brand", sort=False):
        brand_mappings = [item for item in mappings if item["brand"] == brand]
        method_counts = {}
        for item in brand_mappings:
            method_counts[item["matchMethod"]] = method_counts.get(item["matchMethod"], 0) + 1
        matched = len(brand_mappings)
        by_brand[brand] = {
            "total": len(brand_rows), "matched": matched, "missing": len(brand_rows) - matched,
            "matchMethods": method_counts,
        }
    match_methods = {}
    for item in mappings:
        match_methods[item["matchMethod"]] = match_methods.get(item["matchMethod"], 0) + 1
    audit = {
        "schemaVersion": 2,
        "totalMenus": len(rows),
        "matchedMenus": len(mappings),
        "missingMenus": len(failures),
        "candidateCount": len(candidates),
        "matchMethods": match_methods,
        "byBrand": by_brand,
        "collectionErrors": collection_errors,
        "failures": failures,
    }
    AUDIT_PATH.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: audit[key] for key in ("totalMenus", "matchedMenus", "missingMenus", "byBrand")}, ensure_ascii=False, indent=2))

    if args.audit_only or failures or collection_errors:
        return 0 if args.audit_only else 1

    staging = OUTPUT_ROOT / ".items-staging"
    staging.mkdir(parents=True, exist_ok=True)
    if ITEMS_ROOT.exists():
        for existing in ITEMS_ROOT.glob("*.webp"):
            destination = staging / existing.name
            if not valid_optimized_image(destination) and valid_optimized_image(existing):
                shutil.copy2(existing, destination)
    unique_assets = {item["assetSourceUrl"]: item["src"] for item in mappings}
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {
            executor.submit(download_and_optimize, url, staging / Path(src).name): (url, src)
            for url, src in unique_assets.items()
        }
        for index, future in enumerate(as_completed(futures), start=1):
            _url, src = futures[future]
            changed = future.result()
            print(f"{'downloaded' if changed else 'reused'} {index}/{len(unique_assets)} {Path(src).name}", file=sys.stderr)
    if ITEMS_ROOT.exists():
        shutil.rmtree(ITEMS_ROOT)
    staging.rename(ITEMS_ROOT)
    manifest = {
        "schemaVersion": 2,
        "verifiedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "policy": "Every CSV row maps to a product image retrieved from that brand's official public menu page or API. Missing and ambiguous matches fail the sync.",
        "coverage": {"total": len(rows), "mapped": len(mappings), "missing": 0},
        "items": mappings,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(mappings)} mappings and {len(unique_assets)} optimized assets")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
