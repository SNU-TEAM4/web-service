from __future__ import annotations

from pathlib import Path
from math import asin, cos, radians, sin, sqrt

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import requests
import streamlit as st


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

st.set_page_config(page_title="한입안심", page_icon="🍽️", layout="wide")


@st.cache_data
def load_data() -> pd.DataFrame:
    data = pd.read_csv(DATA_PATH)
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
    /* 모바일에서는 조건 사이드바가 접히므로 펼치기 버튼과 안내 문구를 강조한다. */
    @keyframes sidebar-nudge {
        0%, 100% { transform: translateX(0); }
        50% { transform: translateX(-5px); }
    }
    @media (max-width: 768px) {
        div[data-testid="stSidebarCollapsedControl"] {
            position: fixed;
            top: .55rem;
            left: .55rem;
            z-index: 1000000;
            overflow: visible;
        }
        div[data-testid="stSidebarCollapsedControl"] button {
            width: 2.85rem;
            height: 2.85rem;
            border-radius: 50%;
            color: white;
            background: #24734b;
            border: 3px solid white;
            box-shadow: 0 5px 18px rgba(20, 70, 43, .35);
        }
        div[data-testid="stSidebarCollapsedControl"]::after {
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
    }
    </style>
    """,
    unsafe_allow_html=True,
)

data = load_data()

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
tab_results, tab_map, tab_compare, tab_detail, tab_about = st.tabs(
    ["추천 메뉴", "주변 매장", "브랜드 비교", "메뉴 상세 비교", "데이터 안내"]
)

with tab_results:
    head_a, head_b = st.columns([3, 1])
    head_a.markdown("### 조건에 맞는 메뉴")
    sort_name = head_b.selectbox(
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

    if recommended.empty:
        st.warning("모든 조건을 만족하는 메뉴가 없습니다. 영양 조건을 조금 넓혀보세요.")
    else:
        left, right = st.columns(2)
        for index, (_, row) in enumerate(recommended.iterrows()):
            target = left if index % 2 == 0 else right
            target.markdown(
                f"""
                <div class="menu-card">
                  <div class="menu-brand">{row['brand']} · {row['category']}</div>
                  <div class="menu-title">{row['menu']}</div>
                  <div class="menu-meta">{row['calories']:.0f} kcal &nbsp;·&nbsp; 단백질 {row['protein']:.0f}g &nbsp;·&nbsp; 포화지방 {row['fat']:.1f}g &nbsp;·&nbsp; 나트륨 {row['sodium']:.0f}mg{f" &nbsp;·&nbsp; 맞춤 {row['맞춤 점수']:.0f}점" if profile else ""}</div>
                  {f'<div class="metric-note">추천 이유: {row["추천 이유"]}</div>' if profile else ''}
                  {allergen_badges(row['allergen_list'], row['allergen_known'])}
                </div>
                """,
                unsafe_allow_html=True,
            )
        export_cols = ["brand", "menu", "category", "calories", "protein", "fat", "carbs", "sodium", "allergens", "allergen_known", "source_url", "source_date"]
        st.download_button(
            "추천 결과 CSV 다운로드",
            recommended[export_cols].to_csv(index=False).encode("utf-8-sig"),
            "recommended_menus.csv",
            "text/csv",
        )

with tab_map:
    st.markdown("### 내 주변에서 먹을 수 있는 브랜드")
    st.caption("주소를 입력하면 OpenStreetMap의 공개 매장 데이터를 반경 내에서 검색합니다.")
    map_a, map_b = st.columns([3, 1])
    address = map_a.text_input("주소 또는 장소", "서울시청", placeholder="예: 서울 성수역")
    radius_km = map_b.select_slider("검색 반경", [1, 2, 3, 5, 10], value=3, format_func=lambda x: f"{x} km")
    if st.button("주변 매장 찾기", type="primary"):
        try:
            with st.spinner("주소와 주변 매장을 찾고 있어요..."):
                location = geocode(address)
                if not location:
                    st.error("주소를 찾지 못했습니다. 시·구를 포함해 다시 입력해 주세요.")
                else:
                    lat, lon, label = location
                    stores = nearby_stores(lat, lon, radius_km)
                    st.caption(f"검색 중심: {label}")
                    if stores.empty:
                        st.warning("공개 지도 데이터에서 매장을 찾지 못했습니다. 반경을 넓혀보세요.")
                    else:
                        center = pd.DataFrame([{"lat": lat, "lon": lon}])
                        st.map(pd.concat([center, stores[["lat", "lon"]]], ignore_index=True), latitude="lat", longitude="lon", zoom=13)
                        stores["거리(km)"] = stores["거리(km)"].round(2)
                        stores["도보 예상"] = stores["거리(km)"].apply(lambda value: f"약 {travel_minutes(value, 4.5)}분")
                        stores["차량 예상"] = stores["거리(km)"].apply(lambda value: f"약 {travel_minutes(value, 20)}분")
                        st.dataframe(stores[["브랜드", "매장", "거리(km)", "도보 예상", "차량 예상", "주소"]], hide_index=True, use_container_width=True)
                        st.caption("이동시간은 직선거리 × 1.25를 기준으로 계산한 참고값입니다. 실제 경로, 신호와 교통상황에 따라 달라질 수 있습니다.")
                        matched = stores[stores["브랜드"].isin(recommended["brand"].unique())]
                        st.success(f"현재 식단 조건에 맞는 메뉴가 있는 브랜드의 주변 매장: {len(matched)}곳")
        except requests.RequestException as exc:
            st.error("주변 매장 검색 서버가 응답하지 않았습니다. 잠시 후 다시 시도해 주세요.")
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
    chosen = st.multiselect("비교할 메뉴 (최대 4개)", options, default=options[:3], max_selections=4)
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
        display = compared[["label", "calories", "protein", "fat", "carbs", "sodium"]].rename(
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
            columns={"brand": "브랜드", "menu": "메뉴", "category": "분류", "calories": "칼로리", "protein": "단백질", "fat": "포화지방", "carbs": "당류", "sodium": "나트륨", "allergens": "알레르기 성분", "allergen_known": "알레르기 정보 확인", "source_url": "공식 출처", "source_date": "기준일", "verified": "검증"}
        ),
        hide_index=True,
        use_container_width=True,
    )

st.divider()
st.caption("한입안심 MVP · 영양/알레르기: 브랜드 공식 자료 · 매장 위치: OpenStreetMap 기여자 데이터")
