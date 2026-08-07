"""공식 공개 페이지에서 맥도날드·롯데리아 데이터를 갱신한다."""
from __future__ import annotations

import re
from io import StringIO
from pathlib import Path

import pandas as pd
import requests

OUT = Path(__file__).parents[1] / "data" / "menus.csv"
MCD_URL = "https://www.mcdonalds.co.kr/api/v1/kor/product/nutrition"
LOTTE_URL = "https://www.lotteeatz.com/upload/etc/ria/items.html"


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
        # 범위로만 제공되는 세트는 개별 영양 목표 비교에서 제외한다.
        if not str(row.get("calorie", "")).isdigit():
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
        })
    return result


def lotteria() -> list[dict]:
    response = requests.get(LOTTE_URL, timeout=30)
    response.raise_for_status()
    response.encoding = "utf-8"
    table = pd.read_html(StringIO(response.text), flavor="lxml")[0]
    result = []
    for _, row in table.iterrows():
        calories = number(row["열량(kcal)"])
        # 세트 범위와 빈 행은 제외하고 단일 수치가 있는 메뉴만 사용한다.
        if calories is None or "~" in str(row["열량(kcal)"]):
            continue
        menu = str(row["구분"]).strip()
        category = str(row["제품명"]).strip()
        if not menu or menu == "nan":
            continue
        result.append({
            "brand": "롯데리아", "menu": menu, "category": category,
            "calories": calories, "protein": number(row["단백질(g)"]),
            "fat": number(row["포화지방(g)"]), "carbs": number(row["당류(g)"]),
            "sodium": number(row["나트륨(mg)"]),
            "allergens": normalize_allergens(row["알레르기 성분"]),
            "source_url": LOTTE_URL, "source_date": "2026-06-08", "verified": True,
        })
    return result


if __name__ == "__main__":
    frame = pd.DataFrame(mcdonalds() + lotteria())
    frame = frame.dropna(subset=["calories", "protein", "sodium"]).drop_duplicates(["brand", "menu"])
    frame.to_csv(OUT, index=False, encoding="utf-8")
    print(f"saved {len(frame)} verified menu rows -> {OUT}")
