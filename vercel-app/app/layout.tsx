import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://web-service-snu.vercel.app"),
  title: "한입안심 | 공식 프랜차이즈 영양·알레르기 탐색기",
  description: "공식 출처의 영양·알레르기 데이터를 조건별로 탐색하고 브랜드를 비교하는 인터랙티브 웹앱",
  openGraph: {
    title: "한입안심",
    description: "공식 출처로 안심하고 고르는 오늘의 한 끼",
    type: "website",
    locale: "ko_KR",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
