import React from "react";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";

interface MarketingPageShellProps {
  children: React.ReactNode;
}

export default function MarketingPageShell({
  children,
}: MarketingPageShellProps) {
  return (
    <main className="relative min-h-screen overflow-clip-safe bg-slate-950 text-white">
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
