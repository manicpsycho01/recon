import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import { SmoothScroll } from "@/components/SmoothScroll";
import "./globals.css";

const news = Newsreader({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-news" });
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plexsans" });
const plex = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex" });

const url = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3300";

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title: "Recon — match every payment to its invoice",
  description:
    "Bank reconciliation for Indian small businesses: drop your bank statement and invoice list, and Recon matches payments to invoices — TDS deductions, bank charges, split and combined payments included — then shows what's unpaid. Runs in your browser; nothing is uploaded.",
  openGraph: { title: "Recon", description: "Match every payment to its invoice — privately, in seconds.", type: "website" },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#efebe0" }, { media: "(prefers-color-scheme: dark)", color: "#15140f" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${news.variable} ${plexSans.variable} ${plex.variable}`}>
      <body>
        <a href="#main" className="label fixed top-3 left-3 z-50 -translate-y-24 rounded-[3px] bg-ink px-4 py-3 text-paper focus-visible:translate-y-0">
          Skip to content
        </a>
        <SmoothScroll />
        {children}
      </body>
    </html>
  );
}
