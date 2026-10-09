import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Young_Serif } from "next/font/google";
import "./globals.css";

const hanken = Hanken_Grotesk({ variable: "--font-hanken", subsets: ["latin"] });
const youngSerif = Young_Serif({ variable: "--font-young-serif", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: "Economy",
  description: "Gestion de budget personnel",
  appleWebApp: { capable: true, title: "Economy", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef2ec" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1f1b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${hanken.variable} ${youngSerif.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
