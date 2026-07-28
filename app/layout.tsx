import type { Metadata } from "next";
import { Archivo_Black, DM_Sans } from "next/font/google";
import "./globals.css";

const display = Archivo_Black({ variable: "--font-display", subsets: ["latin"], weight: "400" });
const body = DM_Sans({ variable: "--font-body", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Sprite Locker — Fortnite Sprite Checklist",
  description: "A mobile-first checklist for all 91 currently available Fortnite Sprite variants.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${display.variable} ${body.variable}`}>{children}</body></html>;
}
