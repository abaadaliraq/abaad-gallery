import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Alexandria, Montserrat } from "next/font/google";
import { branding } from "@/config/branding";
import { exhibition } from "@/config/exhibition";
import "./globals.css";
import "@/components/protocol/guest-mobile.css";

const arabicFont = Alexandria({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-arabic",
  display: "swap",
  fallback: ["Tahoma", "Arial", "sans-serif"],
});
const englishFont = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-english",
  display: "swap",
  fallback: [],
  adjustFontFallback: false,
});
const palette = exhibition.themeColors;
const theme = {
  "--background": palette.background,
  "--foreground": palette.foreground,
  "--secondary": palette.secondary,
  "--border": palette.border,
  "--surface": palette.card,
  "--accent": palette.accent,
  "--error": palette.error,
} as CSSProperties;

export const metadata: Metadata = {
  title: branding.productName + " | " + branding.productDescription,
  description:
    branding.descriptionAr + " Developed by " + branding.developerName + ".",
  applicationName: branding.productName,
  authors: [{ name: branding.developerName }],
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang={branding.settings.locale}
      dir={branding.settings.direction}
      className={arabicFont.variable + " " + englishFont.variable}
      style={theme}
    >
      <body className="min-h-dvh font-sans font-normal antialiased">
        {children}
      </body>
    </html>
  );
}
