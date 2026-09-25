import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Starcloud Simulator",
  description:
    "Compare a Starcloud orbital AI datacenter with a terrestrial cluster.",
};

export const viewport: Viewport = {
  themeColor: "#090e14",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
    >
      <body className="font-sans">{children}</body>
    </html>
  );
}
