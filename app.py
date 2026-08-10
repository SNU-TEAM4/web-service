from __future__ import annotations

import base64
import json
from pathlib import Path
from math import asin, cos, radians, sin, sqrt

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import pydeck as pdk
import requests
import streamlit as st
import streamlit.components.v1 as components
from streamlit_geolocation import streamlit_geolocation


BASE_DIR = Path(__file__).parent
DATA_PATH = BASE_DIR / "data" / "menus.csv"
ALLERGENS = ["우유", "계란", "밀", "대두", "땅콩", "새우", "게", "돼지고기", "쇠고기", "닭고기"]
NUTRIENTS = {
    "칼로리": ("calories", "kcal"),
    "단백질": ("protein", "g"),
    "포화지방": ("fat", "g"),
    "당류": ("carbs", "g"),
    "나트륨": ("sodium", "mg"),
}
BRAND_COLORS = {
    "맥도날드": [255, 199, 44], "버거킹": [238, 119, 33], "롯데리아": [12, 171, 190],
    "스타벅스": [0, 112, 74], "KFC": [210, 27, 39], "써브웨이": [0, 145, 82],
    "이디야": [28, 60, 116], "배스킨라빈스": [238, 80, 145], "파리바게뜨": [18, 74, 137],
}
BRAND_LOGOS = {
    "맥도날드": "mcdonalds.png", "버거킹": "burgerking.png", "롯데리아": "lotteria.png",
    "스타벅스": "starbucks.png", "KFC": "kfc.png", "써브웨이": "subway.png",
    "이디야": "ediya.png", "배스킨라빈스": "baskinrobbins.png", "파리바게뜨": "parisbaguette.png",
}
BRAND_LOGO_WIDTHS = {
    "맥도날드": 84, "버거킹": 84, "롯데리아": 84, "스타벅스": 84,
    "KFC": 132, "써브웨이": 140, "이디야": 84,
    "배스킨라빈스": 84, "파리바게뜨": 84,
}

st.set_page_config(page_title="한입안심", page_icon="🍽️", layout="wide")


@st.cache_data
def load_data() -> pd.DataFrame:
    data = pd.read_csv(DATA_PATH)
    if "price" not in data.columns:
        data["price"] = pd.NA
    data["allergen_list"] = data["allergens"].fillna("").apply(
        lambda value: [item.strip() for item in value.split("|") if item.strip()]
    )
    data["allergen_known"] = data.get("allergen_known", True).fillna(False).astype(bool)
    return data


def apply_filters(
    data: pd.DataFrame,
    selected_allergens: list[str],
    brands: list[str],
    max_calories: int,
    min_protein: int,
    max_sodium: int,
) -> pd.DataFrame:
    selected = set(selected_allergens)
    result = data[data["brand"].isin(brands)].copy()
    ingredient_safe = result["allergen_list"].apply(lambda items: selected.isdisjoint(items))
    result["알레르기 안전"] = ingredient_safe & (result["allergen_known"] if selected else True)
    result["영양 조건"] = (
        (result["calories"] <= max_calories)
        & (result["protein"] >= min_protein)
        & (result["sodium"] <= max_sodium)
    )
    result["추천 가능"] = result["알레르기 안전"] & result["영양 조건"]
    return result


def calorie_estimate(sex: str, age: int, height: int, weight: float, activity: str, goal: str, meal_type: str) -> dict:
    """Mifflin–St Jeor 기반 성인용 참고 추정치."""
    sex_constant = 5 if sex == "남성 기준" else -161
    resting = 10 * weight + 6.25 * height - 5 * age + sex_constant
    activity_factor = {"낮음 (주로 앉아서 생활)": 1.2, "보통 (주 1~3회 활동)": 1.375,
                       "활동적 (주 3~5회 운동)": 1.55, "매우 활동적": 1.725}[activity]
    maintenance = resting * activity_factor
    goal_factor = {"체중 유지": 1.0, "천천히 감량": 0.9, "감량": 0.8}[goal]
    daily = maintenance * goal_factor
    meal_factor = {"아침": 0.25, "점심": 0.35, "저녁": 0.35, "간식": 0.15}[meal_type]
    return {"resting": round(resting), "maintenance": round(maintenance),
            "daily": round(daily), "meal": round(daily * meal_factor / 50) * 50}


def allergen_badges(items: list[str], known: bool = True) -> str:
    if not known:
        return '<span class="allergen-badge">알레르기 정보 미표기</span>'
    if not items:
        return '<span class="safe-badge">표시 알레르기 성분 없음</span>'
    return " ".join(f'<span class="allergen-badge">{item}</span>' for item in items)


def app_secret(name: str) -> str:
    try:
        return str(st.secrets.get(name, "")).strip()
    except (FileNotFoundError, KeyError):
        return ""


@st.cache_data(ttl=86400, show_spinner=False)
def kakao_geocode(address: str) -> tuple[float, float, str] | None:
    key = app_secret("KAKAO_REST_API_KEY")
    if not key:
        return None
    headers = {"Authorization": f"KakaoAK {key}"}
    response = requests.get(
        "https://dapi.kakao.com/v2/local/search/address.json",
        params={"query": address}, headers=headers, timeout=15,
    )
    response.raise_for_status()
    documents = response.json().get("documents", [])
    if not documents:
        response = requests.get(
            "https://dapi.kakao.com/v2/local/search/keyword.json",
            params={"query": address, "size": 1}, headers=headers, timeout=15,
        )
        response.raise_for_status()
        documents = response.json().get("documents", [])
    if not documents:
        return None
    item = documents[0]
    label = item.get("road_address_name") or item.get("address_name") or address
    return float(item["y"]), float(item["x"]), label


@st.cache_data(ttl=3600, show_spinner=False)
def kakao_location_candidates(query: str) -> list[dict]:
    """주소와 장소 검색 결과를 합쳐 중복 없는 후보를 최대 5개 반환한다."""
    key = app_secret("KAKAO_REST_API_KEY")
    if not key or not query.strip():
        return []
    headers = {"Authorization": f"KakaoAK {key}"}
    candidates = []
    for endpoint in ("address", "keyword"):
        response = requests.get(
            f"https://dapi.kakao.com/v2/local/search/{endpoint}.json",
            params={"query": query.strip(), "size": 5}, headers=headers, timeout=15,
        )
        response.raise_for_status()
        for item in response.json().get("documents", []):
            lat, lon = float(item["y"]), float(item["x"])
            address_name = (
                item.get("road_address_name")
                or (item.get("road_address") or {}).get("address_name")
                or item.get("address_name")
                or (item.get("address") or {}).get("address_name")
                or ""
            )
            place_name = item.get("place_name") or address_name or query.strip()
            label = f"{place_name} · {address_name}" if address_name and address_name != place_name else place_name
            if not any(abs(row["lat"] - lat) < 1e-7 and abs(row["lon"] - lon) < 1e-7 for row in candidates):
                candidates.append({"lat": lat, "lon": lon, "label": label})
    return candidates[:5]


@st.cache_data(ttl=3600, show_spinner=False)
def kakao_nearby_stores(lat: float, lon: float, radius_km: int, brands: tuple[str, ...]) -> pd.DataFrame:
    key = app_secret("KAKAO_REST_API_KEY")
    if not key:
        return pd.DataFrame()
    headers = {"Authorization": f"KakaoAK {key}"}
    rows = []
    for brand in brands:
        for page in (1, 2):
            response = requests.get(
                "https://dapi.kakao.com/v2/local/search/keyword.json",
                params={
                    "query": brand, "x": lon, "y": lat, "radius": radius_km * 1000,
                    "sort": "distance", "size": 15, "page": page,
                },
                headers=headers, timeout=15,
            )
            response.raise_for_status()
            payload = response.json()
            for item in payload.get("documents", []):
                distance = float(item.get("distance") or 0) / 1000
                if distance > radius_km:
                    continue
                rows.append({
                    "매장": item.get("place_name") or brand, "브랜드": brand,
                    "lat": float(item["y"]), "lon": float(item["x"]), "거리(km)": distance,
                    "주소": item.get("road_address_name") or item.get("address_name") or "",
                    "전화": item.get("phone") or "", "카카오맵": item.get("place_url") or "",
                    "place_id": item.get("id") or f"{item['x']}-{item['y']}",
                })
            if payload.get("meta", {}).get("is_end", True):
                break
    if not rows:
        return pd.DataFrame()
    return pd.DataFrame(rows).drop_duplicates("place_id").sort_values("거리(km)")


def render_kakao_map(lat: float, lon: float, radius_km: int, stores: pd.DataFrame) -> None:
    javascript_key = app_secret("KAKAO_JAVASCRIPT_KEY")
    map_level = {1: 4, 2: 5, 3: 6, 5: 7, 10: 8}[radius_km]
    records = []
    for _, row in stores.iterrows():
        records.append({
            "lat": float(row["lat"]), "lon": float(row["lon"]),
            "brand": str(row["브랜드"]), "name": str(row["매장"]),
            "distance": f"{float(row['거리(km)']):.2f}km", "walking": str(row["도보 예상"]),
            "driving": str(row["차량 예상"]), "address": str(row.get("주소", "")),
            "phone": str(row.get("전화", "")), "place_url": str(row.get("카카오맵", "")),
            "pin": brand_pin_icon(str(row["브랜드"]))["url"],
        })
    html = f"""<!doctype html><html><head><meta charset="utf-8">
    <style>html,body,#map{{width:100%;height:100%;margin:0}} .pin{{width:52px;cursor:pointer;filter:drop-shadow(0 3px 3px #0004)}}
    .info{{min-width:210px;padding:12px;font:13px/1.55 -apple-system,BlinkMacSystemFont,sans-serif}}
    .info b{{font-size:15px}} .info a{{display:inline-block;margin-top:7px;color:#1668c1;text-decoration:none;font-weight:700}}</style>
    <script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey={javascript_key}&autoload=false"></script></head>
    <body><div id="map"></div><script>
    kakao.maps.load(function() {{
      const center = new kakao.maps.LatLng({lat}, {lon});
      const map = new kakao.maps.Map(document.getElementById('map'), {{center:center, level:{map_level}}});
      map.addControl(new kakao.maps.MapTypeControl(), kakao.maps.ControlPosition.TOPRIGHT);
      map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
      new kakao.maps.Circle({{center:center, radius:{radius_km * 1000}, strokeWeight:2, strokeColor:'#24734b', strokeOpacity:.7, fillColor:'#24734b', fillOpacity:.07}}).setMap(map);
      const here = document.createElement('div'); here.textContent='★'; here.style.cssText='font-size:30px;color:#1e4bd2;text-shadow:0 2px 3px white';
      new kakao.maps.CustomOverlay({{map:map,position:center,content:here,yAnchor:.5}});
      const stores = {json.dumps(records, ensure_ascii=False)};
      let opened = null;
      stores.forEach(function(s) {{
        const img=document.createElement('img'); img.src=s.pin; img.className='pin'; img.alt=s.brand+' '+s.name;
        const overlay=new kakao.maps.CustomOverlay({{map:map,position:new kakao.maps.LatLng(s.lat,s.lon),content:img,yAnchor:1}});
        img.addEventListener('click',function() {{
          if(opened) opened.setMap(null);
          const box=document.createElement('div'); box.className='info';
          const title=document.createElement('b'); title.textContent=s.brand+' · '+s.name; box.appendChild(title);
          [s.distance+' · 🚶 '+s.walking+' · 🚗 '+s.driving,s.address,s.phone].filter(Boolean).forEach(function(t){{const d=document.createElement('div');d.textContent=t;box.appendChild(d)}});
          if(s.place_url){{const a=document.createElement('a');a.href=s.place_url;a.target='_blank';a.rel='noopener';a.textContent='카카오맵에서 보기 →';box.appendChild(a)}}
          opened=new kakao.maps.CustomOverlay({{map:map,position:new kakao.maps.LatLng(s.lat,s.lon),content:box,yAnchor:1.35,zIndex:10}});
        }});
      }});
    }});
    </script></body></html>"""
    components.html(html, height=570, scrolling=False)


@st.cache_data(ttl=86400, show_spinner=False)
def geocode(address: str) -> tuple[float, float, str] | None:
    response = requests.get(
        "https://nominatim.openstreetmap.org/search",
        params={"q": address, "format": "json", "limit": 1, "countrycodes": "kr"},
        headers={"User-Agent": "hanip-ansim-streamlit/1.0"}, timeout=15,
    )
    response.raise_for_status()
    items = response.json()
    return (float(items[0]["lat"]), float(items[0]["lon"]), items[0]["display_name"]) if items else None


def distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    dlat, dlon = radians(lat2 - lat1), radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 6371 * 2 * asin(sqrt(a))


def travel_minutes(distance: float, speed_kmh: float) -> int:
    """직선거리보다 실제 이동이 긴 점을 고려한 간단한 참고 추정치."""
    route_distance = distance * 1.25
    return max(1, round(route_distance / speed_kmh * 60))


def brand_pin_icon(brand: str) -> dict:
    """브랜드 로고를 품은 역물방울형 SVG 지도 핀을 만든다."""
    color = BRAND_COLORS.get(brand, [80, 95, 88])
    logo_path = BASE_DIR / "assets" / "brand_logos" / BRAND_LOGOS.get(brand, "")
    logo = base64.b64encode(logo_path.read_bytes()).decode("ascii") if logo_path.is_file() else ""
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="96" height="120" viewBox="0 0 96 120">
      <defs><filter id="s" x="-30%" y="-20%" width="160%" height="170%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" flood-opacity=".3"/>
      </filter><clipPath id="c"><circle cx="48" cy="45" r="30"/></clipPath></defs>
      <path filter="url(#s)" fill="rgb({color[0]},{color[1]},{color[2]})"
        d="M48 2C23.7 2 4 21.4 4 45.5C4 79 48 118 48 118s44-39 44-72.5C92 21.4 72.3 2 48 2z"/>
      <circle cx="48" cy="45" r="32" fill="white"/>
      <image href="data:image/png;base64,{logo}" x="17" y="17" width="62" height="56"
        preserveAspectRatio="xMidYMid meet" clip-path="url(#c)"/>
    </svg>"""
    encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return {"url": f"data:image/svg+xml;base64,{encoded}", "width": 96, "height": 120, "anchorY": 120}


@st.cache_data(ttl=3600, show_spinner=False)
def nearby_stores(lat: float, lon: float, radius_km: int) -> pd.DataFrame:
    radius = radius_km * 1000
    # 자유 텍스트 정규식은 Overpass에서 전체 색인을 훑어 자주 타임아웃된다.
    # 브랜드 Wikidata 식별자는 색인 검색이라 훨씬 빠르고 안정적이다.
    brand_ids = "Q38076|Q177054|Q37158|Q524757|Q244457"  # McDonald's, Burger King, Starbucks, KFC, Subway
    query = f'''[out:json][timeout:20];
      nwr["brand:wikidata"~"{brand_ids}"](around:{radius},{lat},{lon});
      out center tags;'''
    endpoints = [
        "https://lz4.overpass-api.de/api/interpreter",
        "https://z.overpass-api.de/api/interpreter",
        "https://overpass-api.de/api/interpreter",
        "https://overpass.private.coffee/api/interpreter",
    ]
    last_error: Exception | None = None
    response = None
    for endpoint in endpoints:
        try:
            candidate = requests.get(
                endpoint, params={"data": query},
                headers={"User-Agent": "hanip-ansim-streamlit/1.0"}, timeout=30,
            )
            candidate.raise_for_status()
            response = candidate
            break
        except requests.RequestException as exc:
            last_error = exc
    if response is None:
        raise requests.ConnectionError(f"모든 매장 검색 서버 실패: {last_error}")
    rows = []
    brand_by_id = {"Q38076": "맥도날드", "Q177054": "버거킹", "Q37158": "스타벅스",
                   "Q524757": "KFC", "Q244457": "써브웨이"}
    for item in response.json().get("elements", []):
        tags = item.get("tags", {})
        item_lat = item.get("lat", item.get("center", {}).get("lat"))
        item_lon = item.get("lon", item.get("center", {}).get("lon"))
        if item_lat is None or item_lon is None:
            continue
        name = tags.get("name:ko") or tags.get("name") or tags.get("brand", "매장")
        brand = brand_by_id.get(tags.get("brand:wikidata")) or next(
            (b for b in ["맥도날드", "버거킹", "롯데리아", "스타벅스"] if b in name),
            tags.get("brand", "기타"),
        )
        rows.append({"매장": name, "브랜드": brand, "lat": item_lat, "lon": item_lon,
                     "거리(km)": distance_km(lat, lon, item_lat, item_lon),
                     "주소": " ".join(filter(None, [tags.get("addr:city"), tags.get("addr:district"), tags.get("addr:street"), tags.get("addr:housenumber")]))})
    # 롯데리아는 OSM에 brand:wikidata 태그가 드물어 Nominatim의 경계 검색으로 보완한다.
    lat_delta = radius_km / 111
    lon_delta = radius_km / max(1, 111 * cos(radians(lat)))
    try:
        lotte_response = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={
                "q": "롯데리아", "format": "json", "limit": 30, "bounded": 1,
                "viewbox": f"{lon-lon_delta},{lat+lat_delta},{lon+lon_delta},{lat-lat_delta}",
            },
            headers={"User-Agent": "hanip-ansim-streamlit/1.0"}, timeout=15,
        )
        lotte_response.raise_for_status()
        for place in lotte_response.json():
            item_lat, item_lon = float(place["lat"]), float(place["lon"])
            distance = distance_km(lat, lon, item_lat, item_lon)
            if distance <= radius_km:
                rows.append({"매장": place.get("name") or place["display_name"].split(",")[0],
                             "브랜드": "롯데리아", "lat": item_lat, "lon": item_lon,
                             "거리(km)": distance, "주소": place.get("display_name", "")})
    except requests.RequestException:
        pass  # 보완 검색 실패 시 이미 확보한 Overpass 결과는 그대로 보여준다.
    return pd.DataFrame(rows).drop_duplicates(["매장", "lat", "lon"]).sort_values("거리(km)") if rows else pd.DataFrame()


st.markdown(
    """
    <style>
    .stApp { background: #f7f8f5; color: #17211b; }
    [data-testid="stSidebar"] { background: #eef3ec; border-right: 1px solid #dce5db; }
    .block-container { max-width: 1320px; padding-top: 2rem; padding-bottom: 3rem; }
    .eyebrow { color: #2d7651; font-weight: 800; letter-spacing: .12em; font-size: .78rem; }
    .hero { padding: 1.4rem 0 1.6rem; }
    .hero h1 { font-size: clamp(2.4rem, 5vw, 4.5rem); line-height: 1.05; letter-spacing: -.06em; margin: .35rem 0 .8rem; }
    .hero p { color: #5d6b62; font-size: 1.08rem; max-width: 700px; line-height: 1.75; }
    .metric-card { background: white; border: 1px solid #e2e8e0; border-radius: 18px; padding: 1.15rem 1.25rem; min-height: 120px; box-shadow: 0 8px 24px rgba(24,50,35,.04); }
    .metric-label { color: #708076; font-size: .85rem; font-weight: 700; }
    .metric-value { font-size: 2rem; font-weight: 850; letter-spacing: -.04em; margin-top: .25rem; }
    .metric-note { color: #88938c; font-size: .78rem; }
    .menu-card { background: white; border: 1px solid #e1e7df; border-radius: 18px; padding: 1rem 1.15rem; margin-bottom: .75rem; }
    .menu-title { font-weight: 850; font-size: 1.05rem; }
    .menu-brand { color: #397a58; font-weight: 750; font-size: .8rem; }
    .menu-meta { color: #68756d; font-size: .84rem; margin: .45rem 0 .65rem; }
    .allergen-badge, .safe-badge { display: inline-block; padding: .22rem .52rem; border-radius: 999px; font-size: .72rem; font-weight: 750; margin: .12rem .08rem; }
    .allergen-badge { background: #fff0e8; color: #a2441f; }
    .safe-badge { background: #e8f5ec; color: #267147; }
    .notice { background: #fff9e9; border: 1px solid #f1dfac; border-radius: 14px; padding: .85rem 1rem; color: #695824; font-size: .85rem; }
    div[data-testid="stMetric"] { background: white; border: 1px solid #e2e8e0; padding: 1rem; border-radius: 16px; }
    .stButton > button, .stDownloadButton > button { border-radius: 12px; font-weight: 750; }
    /* 로고를 버튼 왼쪽에 배치하되 별도 열을 만들지 않아 화면 폭을 넘지 않게 한다. */
    [class*="st-key-brand_header_"] {
        position: relative;
        width: 100%;
        min-width: 0;
        overflow: hidden;
    }
    [class*="st-key-brand_header_"] div[data-testid="stElementContainer"]:has(div[data-testid="stImage"]) {
        position: absolute;
        z-index: 2;
        left: 16px;
        top: 50%;
        width: 70px;
        transform: translateY(-50%);
        pointer-events: none;
    }
    [class*="st-key-brand_header_"] div[data-testid="stImage"] img,
    [class*="st-key-brand_header_"] div[data-testid="stImageContainer"] img {
        display: block;
        width: auto !important;
        max-width: 64px !important;
        max-height: 64px;
        object-fit: contain;
        margin: 0 auto;
    }
    [class*="st-key-brand_header_"] .stButton,
    [class*="st-key-brand_header_"] .stButton > button {
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
    }
    [class*="st-key-brand_header_"] .stButton > button {
        min-height: 76px;
        padding-left: 98px;
        padding-right: 12px;
    }
    [class*="st-key-brand_header_"] .stButton > button p {
        white-space: normal;
        overflow-wrap: anywhere;
        line-height: 1.25;
    }
    /* 모바일에서는 조건 사이드바가 접히므로 펼치기 버튼과 안내 문구를 강조한다. */
    @keyframes sidebar-nudge {
        0%, 100% { transform: translateX(0); }
        50% { transform: translateX(-5px); }
    }
    @media (max-width: 768px) {
        div[data-testid="stSidebarCollapsedControl"],
        div:has(> button[data-testid="stExpandSidebarButton"]) {
            position: fixed;
            top: .55rem;
            left: .55rem;
            z-index: 1000000;
            overflow: visible;
        }
        div[data-testid="stSidebarCollapsedControl"] button,
        button[data-testid="stExpandSidebarButton"] {
            width: 2.85rem;
            height: 2.85rem;
            border-radius: 50%;
            color: white;
            background: #24734b;
            border: 3px solid white;
            box-shadow: 0 5px 18px rgba(20, 70, 43, .35);
        }
        div[data-testid="stSidebarCollapsedControl"]::after,
        div:has(> button[data-testid="stExpandSidebarButton"])::after {
            content: "👈 CLICK! 내 조건 설정";
            position: absolute;
            top: .25rem;
            left: 3.45rem;
            width: max-content;
            padding: .48rem .72rem;
            border-radius: 999px;
            color: white;
            background: #24734b;
            font-size: .82rem;
            font-weight: 850;
            letter-spacing: -.02em;
            box-shadow: 0 5px 18px rgba(20, 70, 43, .25);
            animation: sidebar-nudge 1.2s ease-in-out infinite;
            pointer-events: none;
        }
        .block-container { padding-top: 4.2rem; }
        .hero h1 { font-size: 2.35rem; }
        /* 모바일에서는 로고와 버튼을 더 작게 유지한다. */
        [class*="st-key-brand_header_"] div[data-testid="stElementContainer"]:has(div[data-testid="stImage"]) {
            left: 8px;
            width: 48px;
        }
        [class*="st-key-brand_header_"] div[data-testid="stImage"] img,
        [class*="st-key-brand_header_"] div[data-testid="stImageContainer"] img {
            max-width: 44px !important;
            max-height: 44px;
        }
        [class*="st-key-brand_header_"] .stButton > button {
            min-height: 58px;
            padding-left: 62px;
            padding-right: 8px;
        }
        [class*="st-key-brand_header_"] .stButton > button p {
            font-size: .8rem;
        }
    }
    </style>
    """,
    unsafe_allow_html=True,
)

data = load_data()
if "cart" not in st.session_state:
    st.session_state["cart"] = {}
if "cart_prices" not in st.session_state:
    st.session_state["cart_prices"] = {}

with st.sidebar:
    st.markdown("## 🍽️ 한입안심")
    st.caption("내 조건에 맞는 메뉴 탐색기")
    st.divider()
    st.markdown("#### 1. 피해야 할 알레르기")
    selected_allergens = st.multiselect(
        "알레르기 성분",
        ALLERGENS,
        placeholder="성분을 선택하세요",
        label_visibility="collapsed",
    )
    st.markdown("#### 2. 브랜드")
    brand_options = sorted(data["brand"].unique())
    # 배포 후 브랜드가 늘어났을 때 기존 브라우저 세션의 선택값에는 자동으로
    # 추가되지 않으므로 사용자가 한 번에 최신 전체 목록을 선택할 수 있게 한다.
    if st.button("전체 브랜드 선택", width="stretch"):
        st.session_state["brand_selector_v2"] = brand_options
    selected_brands = st.multiselect(
        "브랜드",
        brand_options,
        default=brand_options,
        key="brand_selector_v2",
        label_visibility="collapsed",
    )
    st.caption(f"공식 데이터 {len(data):,}개 · {len(brand_options)}개 브랜드 · 2026-08-07 갱신")
    st.markdown("#### 3. 맞춤 프로필")
    profile_enabled = st.toggle("신체·다이어트 목표 반영", value=False)
    profile = None
    if profile_enabled:
        sex = st.radio("계산 기준 성별", ["여성 기준", "남성 기준"], horizontal=True)
        p1, p2 = st.columns(2)
        age = p1.number_input("나이", 19, 80, 30, 1)
        height = p2.number_input("키(cm)", 130, 210, 165, 1)
        weight = st.number_input("체중(kg)", 35.0, 200.0, 60.0, 0.5)
        goal_weight = st.number_input("목표 체중(kg)", 35.0, 200.0, max(35.0, weight - 5), 0.5)
        target_weeks = st.slider("목표 기간", 4, 52, 12, 1, format="%d주")
        activity = st.selectbox("평소 활동량", ["낮음 (주로 앉아서 생활)", "보통 (주 1~3회 활동)", "활동적 (주 3~5회 운동)", "매우 활동적"])
        goal = st.segmented_control("목표", ["체중 유지", "천천히 감량", "감량"], default="천천히 감량")
        meal_type = st.segmented_control("지금 찾는 식사", ["아침", "점심", "저녁", "간식"], default="점심")
        priorities = st.multiselect("중요하게 볼 영양 기준", ["칼로리 적합", "고단백", "저나트륨", "저당", "저포화지방"], default=["칼로리 적합", "고단백"])
        profile = calorie_estimate(sex, age, height, weight, activity, goal, meal_type)
        profile.update({"goal_weight": goal_weight, "weeks": target_weeks, "meal_type": meal_type, "priorities": priorities})
        weekly_change = max(0, weight - goal_weight) / target_weeks
        st.info(f"하루 참고 목표 **{profile['daily']:,} kcal** · 한 끼 추천 기준 **{profile['meal']:,} kcal**")
        if goal != "체중 유지":
            st.caption(f"입력한 목표 변화: 주당 약 {weekly_change:.2f}kg · 급격한 감량 목표는 전문가와 상의하세요.")
    st.markdown("#### 4. 영양 조건")
    default_calories = min(1000, max(100, profile["meal"] if profile else 600))
    max_calories = st.slider("최대 칼로리", 100, 1000, default_calories, 50, format="%d kcal", key=f"calories_{default_calories}")
    min_protein = st.slider("최소 단백질", 0, 50, 0, 5, format="%d g")
    max_sodium = st.slider("최대 나트륨", 100, 2000, 1500, 100, format="%d mg")
    st.divider()
    st.caption("조건을 바꾸면 결과가 즉시 갱신됩니다.")

filtered = apply_filters(
    data, selected_allergens, selected_brands, max_calories, min_protein, max_sodium
)
recommended = filtered[filtered["추천 가능"]].copy()
allergy_safe = filtered[filtered["알레르기 안전"]].copy()
if profile is not None and not recommended.empty:
    target = profile["meal"]
    calorie_fit = (1 - (recommended["calories"] - target).abs() / max(target, 1)).clip(lower=0)
    protein_score = (recommended["protein"] / 30).clip(upper=1)
    sodium_score = (1 - recommended["sodium"] / max_sodium).clip(lower=0)
    sugar_score = (1 - recommended["carbs"] / max(recommended["carbs"].quantile(.9), 1)).clip(lower=0)
    fat_score = (1 - recommended["fat"] / max(recommended["fat"].quantile(.9), 1)).clip(lower=0)
    score_map = {"칼로리 적합": calorie_fit, "고단백": protein_score, "저나트륨": sodium_score,
                 "저당": sugar_score, "저포화지방": fat_score}
    chosen_scores = [score_map[name] for name in profile["priorities"] if name in score_map] or [calorie_fit]
    recommended["맞춤 점수"] = (sum(chosen_scores) / len(chosen_scores) * 100).round()
    reason_map = {"칼로리 적합": lambda r: f"한 끼 목표 {target}kcal에 가까움",
                  "고단백": lambda r: f"단백질 {r['protein']:.0f}g",
                  "저나트륨": lambda r: f"나트륨 {r['sodium']:.0f}mg",
                  "저당": lambda r: f"당류 {r['carbs']:.0f}g",
                  "저포화지방": lambda r: f"포화지방 {r['fat']:.1f}g"}
    recommended["추천 이유"] = recommended.apply(
        lambda row: " · ".join(reason_map[p](row) for p in profile["priorities"][:2]) or "열량 조건 충족", axis=1)

st.markdown(
    """
    <div class="hero">
      <div class="eyebrow">EAT WITH CONFIDENCE</div>
      <h1>오늘, 무엇을<br>안심하고 먹을까요?</h1>
      <p>흩어진 프랜차이즈 알레르기·영양 정보를 한곳에서 비교하고,<br>나의 조건에 맞는 메뉴만 빠르게 찾아보세요.</p>
    </div>
    """,
    unsafe_allow_html=True,
)

total = len(filtered)
safe_count = len(allergy_safe)
recommend_count = len(recommended)
safe_rate = round(safe_count / total * 100) if total else 0
cols = st.columns(4)
metrics = [
    ("검토한 메뉴", f"{total}개", f"{len(selected_brands)}개 브랜드"),
    ("알레르기 조건 통과", f"{safe_count}개", f"전체의 {safe_rate}%"),
    ("최종 추천", f"{recommend_count}개", "알레르기 + 영양 조건"),
    (("하루 참고 목표", f"{profile['daily']:,} kcal", f"한 끼 약 {profile['meal']:,} kcal") if profile else
     ("선택한 알레르기", f"{len(selected_allergens)}개", ", ".join(selected_allergens) or "선택 없음")),
]
for col, (label, value, note) in zip(cols, metrics):
    col.markdown(
        f'<div class="metric-card"><div class="metric-label">{label}</div><div class="metric-value">{value}</div><div class="metric-note">{note}</div></div>',
        unsafe_allow_html=True,
    )

st.markdown("<br>", unsafe_allow_html=True)
cart_count = sum(st.session_state["cart"].values())
tab_results, tab_cart, tab_map, tab_compare, tab_detail, tab_about = st.tabs(
    ["추천 메뉴", f"장바구니 ({cart_count})", "주변 매장", "브랜드 비교", "메뉴 상세 비교", "데이터 안내"]
)

with tab_results:
    head_a, head_search, head_sort = st.columns([2.2, 1.4, 1.1])
    head_a.markdown("### 조건에 맞는 메뉴")
    brand_query = head_search.text_input(
        "브랜드명 검색",
        placeholder="🔎 브랜드명 검색",
        label_visibility="collapsed",
    )
    sort_name = head_sort.selectbox(
        "정렬",
        (["맞춤 추천순", "칼로리 낮은 순", "단백질 높은 순", "나트륨 낮은 순"] if profile else
         ["추천순", "칼로리 낮은 순", "단백질 높은 순", "나트륨 낮은 순"]),
        label_visibility="collapsed",
    )
    if sort_name == "맞춤 추천순":
        recommended = recommended.sort_values(["맞춤 점수", "protein"], ascending=False)
    elif sort_name == "칼로리 낮은 순":
        recommended = recommended.sort_values("calories")
    elif sort_name == "단백질 높은 순":
        recommended = recommended.sort_values("protein", ascending=False)
    elif sort_name == "나트륨 낮은 순":
        recommended = recommended.sort_values("sodium")
    else:
        recommended = recommended.sort_values(["protein", "calories"], ascending=[False, True])

    if brand_query.strip():
        recommended = recommended[
            recommended["brand"].str.contains(brand_query.strip(), case=False, regex=False, na=False)
        ]

    if recommended.empty:
        if brand_query.strip():
            st.warning(f"‘{brand_query.strip()}’에 해당하는 브랜드가 없습니다.")
        else:
            st.warning("모든 조건을 만족하는 메뉴가 없습니다. 영양 조건을 조금 넓혀보세요.")
    else:
        st.caption("브랜드 폴더를 누르면 해당 브랜드의 추천 메뉴가 펼쳐집니다.")
        for brand_index, (brand, brand_menus) in enumerate(recommended.groupby("brand", sort=False)):
            state_key = f"brand_folder_{brand}"
            if state_key not in st.session_state:
                st.session_state[state_key] = False
            with st.container(border=True):
                with st.container(key=f"brand_header_{brand_index}"):
                    logo_path = BASE_DIR / "assets" / "brand_logos" / BRAND_LOGOS.get(brand, "")
                    if logo_path.is_file():
                        st.image(str(logo_path), width=BRAND_LOGO_WIDTHS.get(brand, 84))
                    arrow = "▲" if st.session_state[state_key] else "▼"
                    if st.button(
                        f"{brand}  ·  추천 가능 {len(brand_menus)}개  {arrow}",
                        key=f"toggle_{brand}", width="stretch",
                    ):
                        st.session_state[state_key] = not st.session_state[state_key]
                        st.rerun()
                if st.session_state[state_key]:
                    st.caption(
                        f"평균 {brand_menus['calories'].mean():.0f} kcal · "
                        f"평균 단백질 {brand_menus['protein'].mean():.0f}g"
                    )
                    left, right = st.columns(2)
                    for index, (_, row) in enumerate(brand_menus.iterrows()):
                        target = left if index % 2 == 0 else right
                        price_text = f"가격 {float(row['price']):,.0f}원" if pd.notna(row["price"]) else "가격은 매장별 확인"
                        target.markdown(
                            f"""
                            <div class="menu-card">
                              <div class="menu-brand">{row['category']}</div>
                              <div class="menu-title">{row['menu']}</div>
                              <div class="menu-meta">{row['calories']:.0f} kcal &nbsp;·&nbsp; 단백질 {row['protein']:.0f}g &nbsp;·&nbsp; 포화지방 {row['fat']:.1f}g &nbsp;·&nbsp; 나트륨 {row['sodium']:.0f}mg{f" &nbsp;·&nbsp; 맞춤 {row['맞춤 점수']:.0f}점" if profile else ""}</div>
                              <div class="metric-note">{price_text}</div>
                              {f'<div class="metric-note">추천 이유: {row["추천 이유"]}</div>' if profile else ''}
                              {allergen_badges(row['allergen_list'], row['allergen_known'])}
                            </div>
                            """,
                            unsafe_allow_html=True,
                        )
                        cart_label = f"{row['brand']} · {row['menu']}"
                        if target.button("🛒 담기", key=f"cart_add_{row.name}", width="stretch"):
                            st.session_state["cart"][cart_label] = st.session_state["cart"].get(cart_label, 0) + 1
                            st.toast(f"{row['menu']}을(를) 담았습니다.")
                            st.rerun()
        export_cols = ["brand", "menu", "category", "price", "calories", "protein", "fat", "carbs", "sodium", "allergens", "allergen_known", "source_url", "source_date"]
        st.download_button(
            "추천 결과 CSV 다운로드",
            recommended[export_cols].to_csv(index=False).encode("utf-8-sig"),
            "recommended_menus.csv",
            "text/csv",
        )

with tab_cart:
    st.markdown("### 내 장바구니 영양 계산")
    st.caption("여러 브랜드의 메뉴를 한 끼 또는 하루 식단처럼 조합해 합산할 수 있습니다.")
    if not st.session_state["cart"]:
        st.info("추천 메뉴에서 `🛒 담기`를 눌러 버거, 음료, 사이드 등을 조합해 보세요.")
    else:
        data_labels = data["brand"] + " · " + data["menu"]
        cart_rows = []
        for cart_index, (label, saved_qty) in enumerate(list(st.session_state["cart"].items())):
            matched_row = data[data_labels == label]
            if matched_row.empty:
                continue
            row = matched_row.iloc[0]
            with st.container(border=True):
                item_col, price_col, qty_col, remove_col = st.columns([4, 1.6, 1.1, 1], vertical_alignment="center")
                price_text = f"{float(row['price']):,.0f}원" if pd.notna(row["price"]) else "매장별 확인"
                item_col.markdown(f"**{row['menu']}**  \n{row['brand']} · {row['calories']:.0f}kcal · {price_text}")
                default_price = int(row["price"]) if pd.notna(row["price"]) else int(st.session_state["cart_prices"].get(label, 0))
                entered_price = price_col.number_input(
                    "가격(원)", 0, 100000, default_price, 100,
                    key=f"cart_price_{cart_index}_{label}",
                )
                st.session_state["cart_prices"][label] = entered_price
                quantity = qty_col.number_input(
                    "수량", 1, 10, int(saved_qty), key=f"cart_qty_{cart_index}_{label}",
                )
                st.session_state["cart"][label] = quantity
                if remove_col.button("삭제", key=f"cart_remove_{cart_index}_{label}", width="stretch"):
                    del st.session_state["cart"][label]
                    st.session_state["cart_prices"].pop(label, None)
                    st.rerun()
                cart_rows.append((row, quantity))

        if cart_rows:
            totals = {
                nutrient: sum(float(row[nutrient]) * quantity for row, quantity in cart_rows)
                for nutrient in ["calories", "protein", "fat", "carbs", "sodium"]
            }
            total_cols = st.columns(5)
            total_specs = [
                ("칼로리", "calories", "kcal", 0), ("단백질", "protein", "g", 1),
                ("포화지방", "fat", "g", 1), ("당류", "carbs", "g", 1),
                ("나트륨", "sodium", "mg", 0),
            ]
            for col, (name, key, unit, digits) in zip(total_cols, total_specs):
                col.metric(name, f"{totals[key]:,.{digits}f}{unit}")

            st.markdown("#### 하루 기준 분석")
            daily_calories = profile["daily"] if profile else 2000
            references = {
                "calories": ("칼로리", daily_calories, "kcal"), "protein": ("단백질", 55, "g"),
                "fat": ("포화지방", 15, "g"), "carbs": ("당류", 100, "g"),
                "sodium": ("나트륨", 2000, "mg"),
            }
            for key, (name, reference, unit) in references.items():
                ratio = totals[key] / reference if reference else 0
                st.progress(min(ratio, 1.0), text=f"{name} {totals[key]:,.1f}{unit} / {reference:,.0f}{unit} ({ratio * 100:.0f}%)")
                if key != "protein" and ratio > 1:
                    st.error(f"{name}이 하루 참고 기준을 {totals[key] - reference:,.1f}{unit} 초과했습니다.")
            if totals["protein"] >= references["protein"][1]:
                st.success("단백질은 1일 영양성분 기준치 이상입니다.")
            st.caption(
                "칼로리는 맞춤 프로필 사용 시 개인 참고 목표를 적용합니다. 단백질 55g, 포화지방 15g, "
                "당류 100g, 나트륨 2,000mg은 식품 표시의 1일 영양성분 기준치이며 개인 처방값이 아닙니다."
            )

            combined_allergens = sorted({
                allergen for row, _ in cart_rows
                for allergen in (row["allergen_list"] if isinstance(row["allergen_list"], list) else [])
            })
            selected_conflicts = sorted(set(selected_allergens) & set(combined_allergens))
            if selected_conflicts:
                st.error(f"선택한 알레르기 성분 포함: {', '.join(selected_conflicts)}")
            elif selected_allergens:
                st.success("현재 표시된 공식 정보상 선택한 알레르기 성분과 충돌하지 않습니다.")

            entered_prices = [st.session_state["cart_prices"].get(f"{row['brand']} · {row['menu']}", 0) for row, _ in cart_rows]
            if entered_prices and all(price > 0 for price in entered_prices):
                total_price = sum(
                    st.session_state["cart_prices"][f"{row['brand']} · {row['menu']}"] * quantity
                    for row, quantity in cart_rows
                )
                st.metric("예상 합계 가격", f"{total_price:,.0f}원")
            else:
                st.info("공식 가격이 없는 메뉴는 장바구니의 가격 입력란에 현재 매장 가격을 입력하면 합계를 계산합니다.")
            if st.button("장바구니 전체 비우기"):
                st.session_state["cart"] = {}
                st.session_state["cart_prices"] = {}
                st.rerun()

with tab_map:
    st.markdown("### 내 주변에서 먹을 수 있는 브랜드")
    use_kakao = bool(app_secret("KAKAO_JAVASCRIPT_KEY") and app_secret("KAKAO_REST_API_KEY"))
    st.caption(
        "주소와 주변 매장을 카카오맵에서 검색합니다."
        if use_kakao else "주소를 입력하면 OpenStreetMap의 공개 매장 데이터를 반경 내에서 검색합니다."
    )
    search_mode = st.radio(
        "검색 방식", ["주소·장소 검색", "현재 위치 사용"], horizontal=True
    )
    radius_km = st.select_slider("검색 반경", [1, 2, 3, 5, 10], value=3, format_func=lambda x: f"{x} km")
    selected_location = None
    auto_search_location = False
    if search_mode == "현재 위치 사용":
        st.info("📍 아래의 **작은 조준(⌖) 버튼**을 누른 뒤, 브라우저 위치 접근을 **허용**해 주세요. 위치가 확인되면 매장을 자동으로 검색합니다.")
        browser_location = streamlit_geolocation()
        if isinstance(browser_location, dict) and browser_location.get("latitude") is not None:
            accuracy = browser_location.get("accuracy")
            location_label = f"현재 위치 · 정확도 약 {accuracy:.0f}m" if accuracy else "현재 위치"
            selected_location = (
                float(browser_location["latitude"]), float(browser_location["longitude"]), location_label
            )
            location_signature = (
                round(selected_location[0], 5), round(selected_location[1], 5), radius_km,
                tuple(sorted(selected_brands)),
            )
            auto_search_location = st.session_state.get("last_gps_search") != location_signature
            if auto_search_location:
                st.session_state["last_gps_search"] = location_signature
            st.success(f"{location_label}를 확인했습니다. 주변 매장을 검색합니다.")
        else:
            st.warning(
                "버튼을 눌러도 반응이 없으면 주소창 옆 자물쇠/설정에서 이 사이트의 "
                "**위치 권한을 허용**한 뒤 페이지를 새로고침해 주세요. 인앱 브라우저에서는 "
                "Chrome·Safari로 링크를 열어야 할 수 있습니다."
            )
    else:
        address_col, candidate_col = st.columns([3, 1])
        address = address_col.text_input("주소 또는 장소", "서울시청", placeholder="예: 서울 성수역")
        if candidate_col.button("위치 후보 찾기", width="stretch"):
            try:
                if use_kakao:
                    st.session_state["location_candidates"] = kakao_location_candidates(address)
                else:
                    one_location = geocode(address)
                    st.session_state["location_candidates"] = (
                        [{"lat": one_location[0], "lon": one_location[1], "label": one_location[2]}]
                        if one_location else []
                    )
                st.session_state["candidate_query"] = address
            except requests.RequestException:
                st.session_state["location_candidates"] = []
                st.error("위치 후보 검색에 실패했습니다. 잠시 후 다시 시도해 주세요.")
        candidates = (
            st.session_state.get("location_candidates", [])
            if st.session_state.get("candidate_query") == address else []
        )
        if candidates:
            candidate_index = st.selectbox(
                "검색 결과에서 위치를 선택하세요",
                range(len(candidates)), format_func=lambda index: candidates[index]["label"],
            )
            chosen_location = candidates[candidate_index]
            selected_location = (
                chosen_location["lat"], chosen_location["lon"], chosen_location["label"]
            )
        else:
            st.caption("`위치 후보 찾기`를 누르면 최대 5개의 검색 결과가 표시됩니다.")

    search_triggered = st.button(
        "선택 위치 주변 매장 찾기", type="primary", disabled=selected_location is None
    ) or auto_search_location
    if search_triggered:
        try:
            with st.spinner("주소와 주변 매장을 찾고 있어요..."):
                active_kakao = use_kakao
                location = selected_location
                if not location:
                    st.error("주소를 찾지 못했습니다. 시·구를 포함해 다시 입력해 주세요.")
                else:
                    lat, lon, label = location
                    if active_kakao:
                        try:
                            stores = kakao_nearby_stores(lat, lon, radius_km, tuple(selected_brands))
                        except requests.RequestException:
                            active_kakao = False
                            st.warning("카카오 매장 검색이 실패해 기존 공개 지도 데이터로 전환했습니다.")
                            stores = nearby_stores(lat, lon, radius_km)
                    else:
                        stores = nearby_stores(lat, lon, radius_km)
                    st.caption(f"검색 중심: {label}")
                    if stores.empty:
                        st.warning("공개 지도 데이터에서 매장을 찾지 못했습니다. 반경을 넓혀보세요.")
                    else:
                        stores["거리(km)"] = stores["거리(km)"].round(2)
                        stores["도보 예상"] = stores["거리(km)"].apply(lambda value: f"약 {travel_minutes(value, 4.5)}분")
                        stores["차량 예상"] = stores["거리(km)"].apply(lambda value: f"약 {travel_minutes(value, 20)}분")
                        map_stores = stores.rename(columns={
                            "브랜드": "brand", "매장": "store_name", "거리(km)": "distance",
                            "도보 예상": "walking", "차량 예상": "driving", "주소": "address",
                        }).copy()
                        map_stores["color"] = map_stores["brand"].apply(
                            lambda brand: BRAND_COLORS.get(brand, [80, 95, 88])
                        )
                        map_stores["icon_data"] = map_stores["brand"].apply(brand_pin_icon)
                        # 검색 반경을 지도 위에 반투명 원으로 표시한다.
                        radius_points = []
                        for degree in range(0, 361, 6):
                            angle = radians(degree)
                            radius_points.append([
                                lon + radius_km * sin(angle) / max(1, 111 * cos(radians(lat))),
                                lat + radius_km * cos(angle) / 111,
                            ])
                        deck = pdk.Deck(
                            map_style="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
                            initial_view_state=pdk.ViewState(
                                latitude=lat, longitude=lon,
                                zoom={1: 14, 2: 13.5, 3: 13, 5: 12, 10: 11}[radius_km],
                                pitch=0,
                            ),
                            layers=[
                                pdk.Layer(
                                    "PolygonLayer", [{"polygon": radius_points}],
                                    get_polygon="polygon", filled=True, stroked=True,
                                    get_fill_color=[36, 115, 75, 18], get_line_color=[36, 115, 75, 150],
                                    line_width_min_pixels=2,
                                ),
                                pdk.Layer(
                                    "IconLayer", map_stores.to_dict("records"),
                                    get_position="[lon, lat]", get_icon="icon_data",
                                    get_size=52, size_scale=1,
                                    size_min_pixels=42, size_max_pixels=64,
                                    pickable=True,
                                ),
                                pdk.Layer(
                                    "TextLayer", [{"lat": lat, "lon": lon, "icon": "★"}],
                                    get_position="[lon, lat]", get_text="icon", get_color=[30, 75, 210],
                                    get_size=28, get_alignment_baseline="center",
                                ),
                            ],
                            tooltip={"html": (
                                "<b>{brand} · {store_name}</b><br/>"
                                "거리 {distance}km<br/>🚶 {walking} &nbsp; 🚗 {driving}<br/>"
                                "<span style='color:#647067'>{address}</span>"
                            ), "style": {"backgroundColor": "#17211b", "color": "white"}},
                        )
                        if active_kakao:
                            render_kakao_map(lat, lon, radius_km, stores)
                        else:
                            st.pydeck_chart(deck, width="stretch")
                        legend_items = "".join(
                            f'<span style="white-space:nowrap;margin-right:.8rem"><b style="color:rgb({color[0]},{color[1]},{color[2]})">●</b> {brand}</span>'
                            for brand, color in BRAND_COLORS.items() if brand in set(map_stores["brand"])
                        )
                        st.markdown(
                            f'<div style="font-size:.8rem;color:#647067;margin:-.4rem 0 .8rem">'
                            f'<b style="color:#1e4bd2">★</b> 내 위치 &nbsp; {legend_items}</div>',
                            unsafe_allow_html=True,
                        )
                        st.caption("지도에서 매장 아이콘을 누르면 매장명과 이동시간을 확인할 수 있습니다.")
                        st.dataframe(stores[["브랜드", "매장", "거리(km)", "도보 예상", "차량 예상", "주소"]], hide_index=True, use_container_width=True)
                        st.caption("이동시간은 직선거리 × 1.25를 기준으로 계산한 참고값입니다. 실제 경로, 신호와 교통상황에 따라 달라질 수 있습니다.")
                        matched = stores[stores["브랜드"].isin(recommended["brand"].unique())]
                        st.success(f"현재 식단 조건에 맞는 메뉴가 있는 브랜드의 주변 매장: {len(matched)}곳")
        except requests.RequestException as exc:
            st.error("지도 또는 주변 매장 검색 서버가 응답하지 않았습니다. 잠시 후 다시 시도해 주세요.")
            st.caption(f"진단 정보: {type(exc).__name__} · 주소 검색은 정상이며 매장 서버 단계에서 실패했습니다.")

with tab_compare:
    st.markdown("### 브랜드별 선택 가능성")
    if filtered.empty:
        st.info("비교할 브랜드를 하나 이상 선택해 주세요.")
    else:
        summary = (
            filtered.groupby("brand")
            .agg(total=("menu", "count"), safe=("추천 가능", "sum"))
            .reset_index()
        )
        summary["제외"] = summary["total"] - summary["safe"]
        summary["추천 비율"] = summary["safe"] / summary["total"] * 100
        chart_data = summary.melt(
            id_vars="brand", value_vars=["safe", "제외"], var_name="구분", value_name="메뉴 수"
        )
        fig = px.bar(
            chart_data,
            x="brand",
            y="메뉴 수",
            color="구분",
            barmode="stack",
            color_discrete_map={"safe": "#3d8b63", "제외": "#e7b09a"},
            labels={"brand": "브랜드"},
        )
        fig.update_layout(
            paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
            legend_title_text="", margin=dict(l=10, r=10, t=20, b=10), height=390,
        )
        fig.update_yaxes(gridcolor="#e3e8e1")
        st.plotly_chart(fig, use_container_width=True)
        best = summary.sort_values(["추천 비율", "safe"], ascending=False).iloc[0]
        st.success(f"현재 조건에서는 **{best['brand']}**의 추천 가능 비율이 {best['추천 비율']:.0f}%로 가장 높습니다.")

with tab_detail:
    st.markdown("### 메뉴 영양성분 비교")
    available = filtered[filtered["알레르기 안전"]]
    options = (available["brand"] + " · " + available["menu"]).tolist()
    cart_choices = [label for label in st.session_state["cart"] if label in options][:4]
    if "detail_selection" not in st.session_state:
        st.session_state["detail_selection"] = cart_choices or options[:3]
    else:
        st.session_state["detail_selection"] = [
            label for label in st.session_state["detail_selection"] if label in options
        ][:4]
    if st.button("🛒 장바구니 메뉴 불러오기", disabled=not cart_choices):
        st.session_state["detail_selection"] = cart_choices
    chosen = st.multiselect(
        "비교할 메뉴 (최대 4개)", options, max_selections=4, key="detail_selection",
    )
    if chosen:
        keys = available["brand"] + " · " + available["menu"]
        compared = available[keys.isin(chosen)].copy()
        compared["label"] = compared["brand"] + " · " + compared["menu"]
        nutrition = ["calories", "protein", "fat", "carbs", "sodium"]
        normalized = compared[nutrition].div(data[nutrition].max()).mul(100)
        radar = go.Figure()
        for idx, row in compared.reset_index(drop=True).iterrows():
            values = normalized.reset_index(drop=True).iloc[idx].tolist()
            radar.add_trace(
                go.Scatterpolar(r=values + values[:1], theta=["칼로리", "단백질", "포화지방", "당류", "나트륨", "칼로리"], fill="toself", name=row["label"])
            )
        radar.update_layout(
            polar=dict(radialaxis=dict(visible=True, range=[0, 100], ticksuffix="%")),
            paper_bgcolor="rgba(0,0,0,0)", margin=dict(l=40, r=40, t=35, b=20), height=470,
        )
        st.plotly_chart(radar, use_container_width=True)
        compared["가격"] = compared["price"].apply(
            lambda value: f"{float(value):,.0f}원" if pd.notna(value) else "매장별 확인"
        )
        display = compared[["label", "가격", "calories", "protein", "fat", "carbs", "sodium"]].rename(
            columns={"label": "메뉴", "calories": "칼로리(kcal)", "protein": "단백질(g)", "fat": "포화지방(g)", "carbs": "당류(g)", "sodium": "나트륨(mg)"}
        )
        st.dataframe(display, hide_index=True, use_container_width=True)
    else:
        st.info("비교할 메뉴를 선택해 주세요.")

with tab_about:
    st.markdown("### 데이터 및 안전 안내")
    st.markdown(
        """
        <div class="notice"><b>중요:</b> 메뉴 수치는 브랜드 공식 공개 자료를 정제한 값입니다. 제품 구성, 판매 여부와 교차접촉 가능성은 매장과 시기에 따라 달라지므로 주문 전에 공식 원문과 매장에 다시 확인하세요.</div>
        """,
        unsafe_allow_html=True,
    )
    st.markdown(
        """
        #### 실제 서비스 전환 시 확인할 사항

        - 현재 공식 데이터 제공: 맥도날드, 롯데리아, 버거킹, 스타벅스, KFC, 써브웨이, 이디야, 배스킨라빈스, 파리바게뜨 (출처 URL·기준일 열 참고)
        - 메가MGC·컴포즈커피·던킨은 공식 사이트에서 기계 판독 가능한 영양·알레르기 원문을 확보한 뒤 추가 예정
        - 공식 알레르기 필드가 비어 있는 메뉴는 `정보 미표기`로 처리하고, 알레르기 선택 시 추천에서 제외
        - `함유`, `같은 시설에서 제조`, `정보 없음`을 구분하고 보수적으로 필터링
        - 원재료 변경 감지 및 정기 데이터 검수 절차 마련
        - 심각한 알레르기가 있다면 주문 전 브랜드와 매장에 반드시 재확인하도록 안내
        - 맞춤 열량은 성인용 Mifflin–St Jeor 추정식과 활동계수를 사용한 참고값이며 의료·영양 처방이 아님
        """
    )
    st.dataframe(
        data.drop(columns="allergen_list").rename(
            columns={"brand": "브랜드", "menu": "메뉴", "category": "분류", "price": "가격", "calories": "칼로리", "protein": "단백질", "fat": "포화지방", "carbs": "당류", "sodium": "나트륨", "allergens": "알레르기 성분", "allergen_known": "알레르기 정보 확인", "source_url": "공식 출처", "source_date": "기준일", "verified": "검증"}
        ),
        hide_index=True,
        use_container_width=True,
    )

st.divider()
st.caption("한입안심 MVP · 영양/알레르기: 브랜드 공식 자료 · 매장 위치: OpenStreetMap 기여자 데이터")
