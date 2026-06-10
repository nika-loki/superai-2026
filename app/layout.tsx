import type { Metadata } from "next";
import "./globals.css";
import { AccountSearchDialog } from "@/components/account-search-dialog";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "RevenueOS — APAC Account Intelligence",
  description: "Autonomous account research agent for APAC markets",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/favicon-192x192.png",
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-notion-bg text-notion-text antialiased">
        <AppShell>
          {children}
        </AppShell>
        <AccountSearchDialog />
      </body>
    </html>
  );
}
