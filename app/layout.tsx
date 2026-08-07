import type { Metadata } from "next";
import { Archivo_Black, DM_Sans } from "next/font/google";
import "./globals.css";

const display = Archivo_Black({ variable: "--font-display", subsets: ["latin"], weight: "400" });
const body = DM_Sans({ variable: "--font-body", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://sprite-locker-checklist.eabaylor.chatgpt.site"),
  title: "Fortnite Sprite Locker — Sprite Checklist",
  description: "A mobile-first checklist for all 117 currently available Fortnite Sprite variants.",
  openGraph: {
    title: "Fortnite Sprite Locker",
    description: "Track all 117 available Sprite variants—acquired and mastered.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Sprite Locker — 117 variants" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Fortnite Sprite Locker",
    description: "Track all 117 available Sprite variants—acquired and mastered.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${display.variable} ${body.variable}`}>{children}</body></html>;
}
