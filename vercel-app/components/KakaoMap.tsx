"use client";

/* eslint-disable @typescript-eslint/no-explicit-any -- Kakao Maps global SDK는 로컬 타입 선언을 제공하지 않습니다. */

import { useEffect, useRef, useState } from "react";
import { BRAND_LOGOS } from "@/lib/brands";
import type { Store } from "@/lib/types";

declare global {
  interface Window { kakao?: any; }
}

type Props = { center: { lat: number; lon: number }; radiusKm: number; stores: Store[] };

export default function KakaoMap({ center, radiusKm, stores }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const javascriptKey = process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY;

  const latitudeSpan = Math.max(.018, radiusKm * .012);
  const longitudeSpan = Math.max(.024, radiusKm * .016);
  const osmEmbedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(`${center.lon - longitudeSpan},${center.lat - latitudeSpan},${center.lon + longitudeSpan},${center.lat + latitudeSpan}`)}&layer=mapnik&marker=${encodeURIComponent(`${center.lat},${center.lon}`)}`;
  const kakaoMapLink = `https://map.kakao.com/link/map/${encodeURIComponent(`${center.lat},${center.lon}`)}`;

  useEffect(() => {
    if (!javascriptKey || !mapRef.current) return;
    let disposed = false;
    let timeout: number | null = null;
    setStatus("loading"); setError("");
    const fail = () => {
      if (disposed) return;
      setStatus("error");
      setError("카카오 지도 SDK를 불러오지 못했습니다. JavaScript 키와 배포 도메인 등록을 확인해 주세요.");
    };
    const draw = () => {
      if (!window.kakao?.maps) { fail(); return; }
      window.kakao.maps.load(() => {
        if (disposed || !mapRef.current) return;
        try {
          const kakao = window.kakao;
          mapRef.current.replaceChildren();
          const position = new kakao.maps.LatLng(center.lat, center.lon);
          const map = new kakao.maps.Map(mapRef.current, { center: position, level: ({ 1: 4, 2: 5, 3: 6, 5: 7, 10: 8 } as Record<number, number>)[radiusKm] || 6 });
          new kakao.maps.Circle({ center: position, radius: radiusKm * 1000, strokeWeight: 2, strokeColor: "#0071e3", strokeOpacity: .65, fillColor: "#0071e3", fillOpacity: .06 }).setMap(map);

          const here = document.createElement("div");
          here.className = "current-location-dot";
          new kakao.maps.CustomOverlay({ map, position, content: here, yAnchor: .5 });

          let opened: any = null;
          stores.forEach((store) => {
            const pin = document.createElement("button");
            pin.type = "button";
            pin.className = "store-pin";
            const logoPath = BRAND_LOGOS[store.brand];
            if (logoPath) {
              const logo = document.createElement("img");
              logo.src = logoPath;
              logo.alt = "";
              pin.appendChild(logo);
            } else {
              const fallback = document.createElement("span");
              fallback.className = "store-pin-fallback";
              fallback.textContent = store.brand.slice(0, 1);
              pin.appendChild(fallback);
            }
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
                const link = document.createElement("a"); link.href = store.placeUrl; link.textContent = "카카오맵에서 보기 →"; card.appendChild(link);
              }
              opened = new kakao.maps.CustomOverlay({ map, position: storePosition, content: card, yAnchor: 1.25, zIndex: 10 });
            };
          });
          if (timeout !== null) window.clearTimeout(timeout);
          setStatus("ready");
        } catch { fail(); }
      });
    };

    timeout = window.setTimeout(fail, 10000);
    let script: HTMLScriptElement | null = null;
    if (window.kakao?.maps) draw();
    else {
      const existing = document.querySelector<HTMLScriptElement>("script[data-kakao-map]");
      if (existing) {
        script = existing;
        existing.addEventListener("load", draw, { once: true });
        existing.addEventListener("error", fail, { once: true });
      }
      else {
        script = document.createElement("script");
        script.dataset.kakaoMap = "true";
        script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${javascriptKey}&autoload=false`;
        script.onload = draw;
        script.onerror = fail;
        document.head.appendChild(script);
      }
    }
    return () => {
      disposed = true;
      if (timeout !== null) window.clearTimeout(timeout);
      script?.removeEventListener("load", draw);
      script?.removeEventListener("error", fail);
    };
  }, [center, javascriptKey, radiusKm, stores]);

  if (!javascriptKey) return <div className="map-stage map-fallback-stage">
    <iframe className="osm-map" title="선택 위치 OpenStreetMap 대체 지도" src={osmEmbedUrl} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
    <div className="map-provider-badge"><b>OpenStreetMap 대체 지도</b><span>Kakao JavaScript 키 연결 전에도 위치를 확인할 수 있습니다.</span></div>
    <div className="map-provider-links"><a href={kakaoMapLink}>카카오맵에서 이 위치 열기 →</a><a href="https://www.openstreetmap.org/copyright">지도 저작권</a></div>
  </div>;
  return <div className="map-stage"><div ref={mapRef} className="kakao-map" role="region" aria-label="선택 위치와 주변 프랜차이즈 매장 지도" />{status === "loading" && <div className="map-loading" role="status">카카오 지도를 불러오는 중입니다…</div>}{status === "error" && <div className="map-sdk-error" role="alert"><b>지도를 표시하지 못했습니다.</b><span>{error}</span></div>}</div>;
}
