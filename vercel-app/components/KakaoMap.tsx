"use client";

import { useEffect, useRef } from "react";
import { BRAND_LOGOS } from "@/lib/brands";
import type { Store } from "@/lib/types";

declare global {
  interface Window { kakao?: any; }
}

type Props = { center: { lat: number; lon: number }; radiusKm: number; stores: Store[] };
const PIN_COLORS: Record<string, string> = { "맥도날드": "#ffcc00", "롯데리아": "#f00028", "버거킹": "#ed7800", "스타벅스": "#00754a", "KFC": "#c8102e", "써브웨이": "#008c45", "이디야": "#172f70", "배스킨라빈스": "#f45b9d", "파리바게뜨": "#112e67" };

export default function KakaoMap({ center, radiusKm, stores }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY;
    if (!key || !mapRef.current) return;
    const draw = () => window.kakao.maps.load(() => {
      if (!mapRef.current) return;
      const kakao = window.kakao;
      const position = new kakao.maps.LatLng(center.lat, center.lon);
      const level = radiusKm <= 1 ? 4 : radiusKm <= 2 ? 5 : radiusKm <= 4 ? 6 : radiusKm <= 7 ? 7 : 8;
      const map = new kakao.maps.Map(mapRef.current, { center: position, level });
      new kakao.maps.Circle({ center: position, radius: radiusKm * 1000, strokeWeight: 2, strokeColor: "#24734b", strokeOpacity: .65, fillColor: "#24734b", fillOpacity: .06 }).setMap(map);

      const here = document.createElement("div");
      here.className = "current-location-dot";
      new kakao.maps.CustomOverlay({ map, position, content: here, yAnchor: .5 });

      let opened: any = null;
      let selectedPin: HTMLButtonElement | null = null;
      const nearbyPositions = new Map<string, number>();
      stores.forEach((store) => {
        const pin = document.createElement("button");
        pin.className = "store-pin";
        pin.dataset.brand = store.brand;
        pin.style.setProperty("--pin-color", PIN_COLORS[store.brand] || "#287653");
        const positionKey = `${store.lat.toFixed(4)}:${store.lon.toFixed(4)}`;
        const positionOrder = nearbyPositions.get(positionKey) || 0;
        nearbyPositions.set(positionKey, positionOrder + 1);
        if (positionOrder > 0) {
          const angle = positionOrder * 2.4;
          const offset = Math.min(18, 7 + positionOrder * 3);
          pin.style.left = `${Math.cos(angle) * offset}px`;
          pin.style.top = `${Math.sin(angle) * offset}px`;
        }
        const logo = document.createElement("img");
        logo.src = BRAND_LOGOS[store.brand] || "";
        logo.alt = "";
        pin.appendChild(logo);
        pin.setAttribute("aria-label", `${store.brand} ${store.name}`);
        const storePosition = new kakao.maps.LatLng(store.lat, store.lon);
        const baseZIndex = Math.max(1, 50 - Math.round(store.distance * 2));
        const overlay = new kakao.maps.CustomOverlay({ map, position: storePosition, content: pin, yAnchor: 1, zIndex: baseZIndex });
        pin.onmouseenter = () => { pin.classList.add("hovered"); overlay.setZIndex(100); };
        pin.onmouseleave = () => { pin.classList.remove("hovered"); if (pin !== selectedPin) overlay.setZIndex(baseZIndex); };
        pin.onclick = () => {
          if (opened) opened.setMap(null);
          if (selectedPin) selectedPin.classList.remove("selected");
          selectedPin = pin;
          pin.classList.add("selected");
          overlay.setZIndex(110);
          const card = document.createElement("div");
          card.className = "map-info-card";
          const safeName = document.createElement("b");
          safeName.textContent = `${store.brand} · ${store.name}`;
          card.appendChild(safeName);
          [ `${store.distance.toFixed(2)}km · 도보 약 ${Math.ceil(store.distance * 1.25 / 4.5 * 60)}분`, store.address, store.phone || "" ].filter(Boolean).forEach((text) => {
            const line = document.createElement("div"); line.textContent = text; card.appendChild(line);
          });
          if (store.placeUrl) {
            const link = document.createElement("a"); link.href = store.placeUrl; link.target = "_blank"; link.rel = "noopener"; link.textContent = "카카오맵에서 보기 →"; card.appendChild(link);
          }
          opened = new kakao.maps.CustomOverlay({ map, position: storePosition, content: card, yAnchor: 1.25, zIndex: 10 });
        };
      });
    });

    if (window.kakao?.maps) draw();
    else {
      const existing = document.querySelector<HTMLScriptElement>("script[data-kakao-map]");
      if (existing) existing.addEventListener("load", draw, { once: true });
      else {
        const script = document.createElement("script");
        script.dataset.kakaoMap = "true";
        script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false`;
        script.onload = draw;
        document.head.appendChild(script);
      }
    }
  }, [center, radiusKm, stores]);

  if (!process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY) return <div className="map-empty">Vercel 환경변수에 카카오 JavaScript 키를 등록해 주세요.</div>;
  return <div ref={mapRef} className="kakao-map" />;
}
