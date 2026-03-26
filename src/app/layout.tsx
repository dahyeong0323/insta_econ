import type { Metadata } from "next";
import { IBM_Plex_Sans_KR, Space_Grotesk } from "next/font/google";

import { AppProviders } from "@/components/providers/app-providers";

import "./globals.css";

const bodyFont = IBM_Plex_Sans_KR({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const displayFont = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "700"],
});

export const metadata: Metadata = {
  title: "보리의 10대를 위한 경제",
  description:
    "경제학 텍스트와 PDF를 6~10장 editorial Q&A 카드뉴스로 바꾸는 한국어 에이전트 기반 웹 앱",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${bodyFont.variable} ${displayFont.variable} antialiased`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
