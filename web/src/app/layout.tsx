import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import WalletProviders from "../components/WalletProviders";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jupiter Funds For Mike's Baby 👶🎁",
  description:
    "Pre-celebrating Mike's incoming baby with onchain yield. " +
    "Two AI agents (Claude + Claw 🦞) debate the next best Jupiter " +
    "move; user votes; winner executes on Solana mainnet. " +
    "Built with love for Clawathon Tokyo Edition.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <WalletProviders>{children}</WalletProviders>
      </body>
    </html>
  );
}
