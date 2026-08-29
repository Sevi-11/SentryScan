import type { Metadata } from "next";
import { Bodoni_Moda, Comfortaa, Inter } from "next/font/google";
import DevToolsGuard from "./DevToolsGuard";
import "./globals.css";

const bodoni = Bodoni_Moda({
  variable: "--font-bodoni",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const comfortaa = Comfortaa({
  variable: "--font-comfortaa",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SentryScan",
  description: "Detect. Track. Protect.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bodoni.variable} ${comfortaa.variable} ${inter.variable}`}>
      <body>
        <DevToolsGuard />
        {children}
      </body>
    </html>
  );
}
