import type { Metadata, Viewport } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["300", "400", "500", "900"],
  style: ["normal", "italic"],
  variable: "--font-roboto",
  display: "swap",
});

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_TITLE || "Golgi Day — Bacheca",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={roboto.variable}>
      <body>{children}</body>
    </html>
  );
}
