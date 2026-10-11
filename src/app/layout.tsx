import type { Metadata, Viewport } from "next";
import { Poppins, Noto_Sans_Khmer } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/layout/providers";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Khmer glyph fallback — Poppins has no Khmer coverage.
const khmer = Noto_Sans_Khmer({
  variable: "--font-khmer",
  subsets: ["khmer"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "LedgerVision", template: "%s · LedgerVision" },
  description: "AI-powered financial management for Cambodian retail businesses.",
};

export const viewport: Viewport = {
  themeColor: "#166534",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${poppins.variable} ${khmer.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
