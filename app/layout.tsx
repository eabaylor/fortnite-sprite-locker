import type { Metadata } from "next";
import { Archivo_Black, DM_Sans } from "next/font/google";
import catalog from "@/data/catalog.json";
import "./globals.css";

const display = Archivo_Black({ variable: "--font-display", subsets: ["latin"], weight: "400" });
const body = DM_Sans({ variable: "--font-body", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://sprite-locker-checklist.eabaylor.chatgpt.site"),
  title: "Fortnite Sprite Locker — Sprite Checklist",
  description: `A mobile-first checklist for all ${catalog.families.reduce((sum, family) => sum + family.variants.length, 0)} currently available Fortnite Sprite variants.`,
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "Fortnite Sprite Locker",
    description: `Track every ${catalog.chapter} ${catalog.season} Sprite variant—acquired and mastered.`,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Fortnite Sprite Locker" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Fortnite Sprite Locker",
    description: `Track every ${catalog.chapter} ${catalog.season} Sprite variant—acquired and mastered.`,
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${display.variable} ${body.variable}`}>{children}</body></html>;
}
