import React from "react";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";

interface MarketingPageShellProps {
  children: React.ReactNode;
  /** The page's language when it is not English (the root layout says "en"). */
  lang?: string;
}

export default function MarketingPageShell({
  children,
  lang,
}: MarketingPageShellProps) {
  return (
    <main lang={lang} className="relative min-h-screen overflow-clip-safe bg-slate-950 text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-grid-pattern"
      />
      <SiteHeader />
      <div
        id="content"
        className="relative isolate pt-24 sm:pt-36 md:pt-24"
      >
        {children}
      </div>
      <SiteFooter />
    </main>
  );
}
