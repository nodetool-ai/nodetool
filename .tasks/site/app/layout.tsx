import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "NodeTool Tasks",
  description: "Plans and tasks for developing NodeTool — markdown-native, conflict-free.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} dark`} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <SiteHeader />
        <main className="container py-8">{children}</main>
        <footer className="border-t border-border/60 mt-16">
          <div className="container py-6 flex items-center justify-between text-xs text-muted-foreground">
            <span>Source of truth lives in <code className="font-mono text-foreground/80">.tasks/</code>.</span>
            <span>Built with Next.js</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
