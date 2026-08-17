import type { Metadata } from "next";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://hanip-ansim.vercel.app"),
  title: "한입안심",
  description: "알레르기와 영양 조건에 맞는 프랜차이즈 메뉴 탐색기",
  openGraph: {
    title: "한입안심",
    description: "알레르기와 영양 조건에 맞는 프랜차이즈 메뉴를 한곳에서 탐색하세요.",
    url: "/",
    siteName: "한입안심",
    locale: "ko_KR",
    type: "website",
    images: [
      {
        url: "/hanip-ansim-share.png",
        width: 1200,
        height: 630,
        alt: "오늘의 한 끼, 안심하고 고르세요 - 한입안심",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "한입안심",
    description: "알레르기와 영양 조건에 맞는 프랜차이즈 메뉴를 한곳에서 탐색하세요.",
    images: ["/hanip-ansim-share.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
