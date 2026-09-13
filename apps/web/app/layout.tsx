import type { Metadata } from "next";
import { Instrument_Serif, JetBrains_Mono, Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const serif = Instrument_Serif({ weight: "400", subsets: ["latin"], variable: "--font-serif", style: ["normal", "italic"] });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });
const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  metadataBase: new URL("https://revoke-eth-web.vercel.app"),
  title: {
    default: "Revoke — Capability-Gated Payments for AI Agents",
    template: "%s — Revoke",
  },
  description:
    "Revoke gates agent payments on a revocable capability recorded in ENS. Grant a scoped right, verify freshness via The Graph, settle on Hedera — revoke it and the same request instantly fails.",
  keywords: [
    "ENS",
    "ENSv2",
    "AI agents",
    "agent authorization",
    "capability revocation",
    "x402",
    "agent payments",
    "The Graph",
    "subgraph",
    "Hedera",
    "HCS",
    "Hedera Consensus Service",
    "ERC-3009",
    "transferWithAuthorization",
    "onchain authorization",
    "delegation",
    "revocable capabilities",
    "Sepolia",
    "web3 agents",
    "autonomous agents",
    "EthOnline",
  ],
  authors: [{ name: "AgentNS" }],
  applicationName: "Revoke",
  category: "technology",
  openGraph: {
    type: "website",
    siteName: "Revoke",
    title: "Revoke — Capability-Gated Payments for AI Agents",
    description:
      "Payment gated on a revocable capability recorded in ENS. Grant → verify via The Graph → settle on Hedera → revoke and the same request fails.",
    images: [{ url: "/RevokeBanner.png", width: 1200, height: 630, alt: "Revoke" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Revoke — Capability-Gated Payments for AI Agents",
    description:
      "Payment gated on a revocable capability recorded in ENS. ENS · The Graph · Hedera.",
    images: ["/RevokeBanner.png"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${mono.variable} ${sans.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
