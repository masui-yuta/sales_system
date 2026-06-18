import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "営業システム",
  description: "関西営業CRM",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        {children}
        <footer className="p-4 text-center text-xs text-gray-400">
          本データは国税庁法人番号公表サイトのデータを加工して作成しています
          <br />
          業種の一部に gBizINFO（経済産業省）のデータを加工して使用しています
          <br />
          電話番号の一部に © OpenStreetMap contributors のデータを使用しています
        </footer>
      </body>
    </html>
  );
}
