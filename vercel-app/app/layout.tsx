import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "한입안심",
  description: "알레르기와 영양 조건에 맞는 프랜차이즈 메뉴 탐색기"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
