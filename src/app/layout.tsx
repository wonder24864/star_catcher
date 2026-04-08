import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Star Catcher - 智能错题本",
  description: "面向 K-12 学生的智能错题本系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
