"use client";

import { useEffect, useRef } from "react";
import { BRAND_COLORS, BRAND_LOGOS } from "@/lib/brands";
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
      const level = radiusKm <= 1 ? 4 : radiusKm <= 2 ? 5 : radiusKm <= 4 ? 6 : radiusKm <= 7 ? 7 : 8;
      const map = new kakao.maps.Map(mapRef.current, { center: position, level });
      new kakao.maps.Circle({ center: position, radius: radiusKm * 1000, strokeWeight: 2, strokeColor: "#24734b", strokeOpacity: .65, fillColor: "#24734b", fillOpacity: .06 }).setMap(map);

      const here = document.createElement("div");
      here.className = "current-location-dot";
      new kakao.maps.CustomOverlay({ map, position, content: here, yAnchor: .5 });

      let opened: any = null;
      let selectedPin: HTMLButtonElement | null = null;
      let selectedOverlay: any = null;
      let selectedBaseZIndex = 1;
      const nearbyPositions = new Map<string, number>();
      stores.forEach((store) => {
        const pin = document.createElement("button");
        pin.className = "store-pin";
        pin.dataset.brand = store.brand;
        pin.style.setProperty("--pin-color", BRAND_COLORS[store.brand] || "#287653");
        const positionKey = `${store.lat.toFixed(3)}:${store.lon.toFixed(3)}`;
        const positionOrder = nearbyPositions.get(positionKey) || 0;
        nearbyPositions.set(positionKey, positionOrder + 1);
        if (positionOrder > 0) {
          const angle = positionOrder * 2.4;
          const offset = Math.min(28, 9 + positionOrder * 4);
          pin.style.left = `${Math.cos(angle) * offset}px`;
          pin.style.top = `${Math.sin(angle) * offset}px`;
        }
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 60 72");
        svg.setAttribute("aria-hidden", "true");
        const shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
        shape.setAttribute("d", "M30 2C14.5 2 3 13.8 3 29.5C3 46.5 18.8 59.4 30 70C41.2 59.4 57 46.5 57 29.5C57 13.8 45.5 2 30 2Z");
        shape.setAttribute("fill", "white");
        shape.setAttribute("stroke", BRAND_COLORS[store.brand] || "#287653");
        shape.setAttribute("stroke-width", "3");
        svg.appendChild(shape);
        const logoPath = BRAND_LOGOS[store.brand];
        if (logoPath) {
          const logo = document.createElementNS("http://www.w3.org/2000/svg", "image");
          logo.setAttribute("href", logoPath);
          logo.setAttribute("x", "11");
          logo.setAttribute("y", "9");
          logo.setAttribute("width", "38");
          logo.setAttribute("height", "38");
          logo.setAttribute("preserveAspectRatio", "xMidYMid meet");
          svg.appendChild(logo);
        } else {
          const initials = document.createElementNS("http://www.w3.org/2000/svg", "text");
          initials.setAttribute("x", "30");
          initials.setAttribute("y", "34");
          initials.setAttribute("text-anchor", "middle");
          initials.setAttribute("fill", BRAND_COLORS[store.brand] || "#287653");
          initials.setAttribute("font-size", store.brand.length > 4 ? "10" : "13");
          initials.setAttribute("font-weight", "900");
          initials.textContent = store.brand.length > 4 ? store.brand.slice(0, 4) : store.brand;
          svg.appendChild(initials);
        }
        pin.appendChild(svg);
        pin.setAttribute("aria-label", `${store.brand} ${store.name}`);
        const storePosition = new kakao.maps.LatLng(store.lat, store.lon);
        const baseZIndex = Math.max(1, 50 - Math.round(store.distance * 2));
        const overlay = new kakao.maps.CustomOverlay({ map, position: storePosition, content: pin, yAnchor: 1, zIndex: baseZIndex });
        pin.onmouseenter = () => { pin.classList.add("hovered"); overlay.setZIndex(100); };
        pin.onmouseleave = () => { pin.classList.remove("hovered"); if (pin !== selectedPin) overlay.setZIndex(baseZIndex); };
        pin.onclick = () => {
          if (opened) opened.setMap(null);
          if (selectedPin) selectedPin.classList.remove("selected");
          if (selectedOverlay) selectedOverlay.setZIndex(selectedBaseZIndex);
          selectedPin = pin;
          selectedOverlay = overlay;
          selectedBaseZIndex = baseZIndex;
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
          opened = new kakao.maps.CustomOverlay({ map, position: storePosition, content: card, xAnchor: .5, yAnchor: 1.35, zIndex: 1000 });
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
