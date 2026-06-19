import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Keel — Autonomous Spot Trading Agent",
  description:
    "Drawdown-aware autonomous spot trading agent on BNB Chain. Spot only.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
