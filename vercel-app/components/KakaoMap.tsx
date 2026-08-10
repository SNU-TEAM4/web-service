"use client";

import { useEffect, useRef } from "react";
import { BRAND_LOGOS } from "@/lib/brands";
import type { Store } from "@/lib/types";

declare global {
  interface Window { kakao?: any; }
}

type Props = { center: { lat: number; lon: number }; radiusKm: number; stores: Store[] };

export default function KakaoMap({ center, radiusKm, stores }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY;
    if (!key || !mapRef.current) return;
    const draw = () => window.kakao.maps.load(() => {
      if (!mapRef.current) return;
      const kakao = window.kakao;
      const position = new kakao.maps.LatLng(center.lat, center.lon);
      const map = new kakao.maps.Map(mapRef.current, { center: position, level: ({ 1: 4, 2: 5, 3: 6, 5: 7, 10: 8 } as Record<number, number>)[radiusKm] || 6 });
      new kakao.maps.Circle({ center: position, radius: radiusKm * 1000, strokeWeight: 2, strokeColor: "#24734b", strokeOpacity: .65, fillColor: "#24734b", fillOpacity: .06 }).setMap(map);

      const here = document.createElement("div");
      here.className = "current-location-dot";
      new kakao.maps.CustomOverlay({ map, position, content: here, yAnchor: .5 });

      let opened: any = null;
      stores.forEach((store) => {
        const pin = document.createElement("button");
        pin.className = "store-pin";
        const logo = document.createElement("img");
        logo.src = BRAND_LOGOS[store.brand] || "";
        logo.alt = "";
        pin.appendChild(logo);
        pin.setAttribute("aria-label", `${store.brand} ${store.name}`);
        const storePosition = new kakao.maps.LatLng(store.lat, store.lon);
        new kakao.maps.CustomOverlay({ map, position: storePosition, content: pin, yAnchor: 1 }).setMap(map);
        pin.onclick = () => {
          if (opened) opened.setMap(null);
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
