"use client";
import React, { useEffect, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import { track } from "../lib/analytics";

/**
 * Single shared site header used by every route (P3). Replaces the per-page
 * nav blocks that had drifted apart. Active state derives from the current
 * pathname, so cross-linking between personas is consistent everywhere.
 */

type NavItem = { name: string; href: string; external?: boolean };

const NAV: NavItem[] = [
  { name: "Studio", href: "/studio" },
  { name: "Cloud", href: "/cloud" },
  { name: "Creatives", href: "/creatives" },
  { name: "Agents", href: "/agents" },
  { name: "Developers", href: "/developers" },
  { name: "Marketing", href: "/marketing" },
  { name: "Pricing", href: "/pricing" },
  { name: "Docs", href: "https://docs.nodetool.ai", external: true },
];

const GITHUB_URL = "https://github.com/nodetool-ai/nodetool";

function Wordmark() {
  return (
    <a
      href="/"
      className="group flex items-center gap-2 rounded focus-ring"
      aria-label="NodeTool home"
    >
      <Image
        src="/logo_small.webp"
        alt=""
        width={48}
        height={48}
        priority
        sizes="48px"
        className="h-8 w-8 sm:h-10 sm:w-10 brightness-0 invert transition-all duration-300 group-hover:brightness-100 group-hover:invert-0"
      />
      {/* Solid near-white wordmark — the legacy amber/orange gradient is retired (P5). */}
      <span className="text-base sm:text-xl font-bold tracking-widest text-white">
        nodetool
      </span>
    </a>
  );
}

export default function SiteHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    fetch(`https://api.github.com/repos/nodetool-ai/nodetool`)
      .then((r) => r.json())
      .then((j) => {
        if (typeof j.stargazers_count === "number") setStars(j.stargazers_count);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const isActive = (item: NavItem) =>
    !item.external && (pathname === item.href);

  return (
    <header>
      <nav
        className="fixed top-0 left-0 right-0 z-50 border-b border-slate-800/60 bg-glass supports-[backdrop-filter]:bg-glass shadow-[0_1px_0_0_rgba(59,130,246,0.08)]"
        aria-label="Primary"
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-8 py-2 sm:py-3">
          <div className="relative flex items-center justify-center gap-6 w-full min-h-[44px] sm:min-h-[56px]">
            <div className="absolute left-0 flex items-center h-9 sm:h-10">
              <Wordmark />
            </div>

            <ul className="hidden md:flex items-center gap-1 lg:gap-2 mx-auto rounded-full bg-slate-900/40 ring-1 ring-white/5 px-2 py-1 border border-slate-800/50">
              {NAV.map((item) => {
                const active = isActive(item);
                return (
                  <li key={item.name} className="list-none">
                    <a
                      href={item.href}
                      {...(item.external
                        ? { target: "_blank", rel: "noopener noreferrer" }
                        : {})}
                      onClick={
                        item.name === "Docs"
                          ? () => track("Open Docs")
                          : undefined
                      }
                      className={`px-3 py-1.5 text-sm font-medium rounded-full lift focus-ring ${
                        active
                          ? "bg-blue-600/25 text-blue-200 border border-blue-500/40"
                          : "text-slate-300 hover:text-blue-200 hover:bg-slate-800/60"
                      }`}
                      aria-current={active ? "page" : undefined}
                    >
                      {item.name}
                    </a>
                  </li>
                );
              })}
            </ul>

            <div className="absolute right-0 flex items-center gap-2 h-full">
              <button
                type="button"
                className="md:hidden rounded-md p-1.5 text-slate-300 hover:bg-slate-800/60 transition-colors focus-ring"
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
              >
                <Bars3Icon className="h-5 w-5" aria-hidden="true" />
              </button>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("Star GitHub")}
                className="hidden sm:inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-3.5 py-2 text-sm font-semibold text-slate-100 transition-all hover:border-slate-500 hover:bg-slate-800/70 focus-ring"
                aria-label="Star NodeTool on GitHub"
              >
                <Image
                  src="/github-mark-white.svg"
                  alt=""
                  width={18}
                  height={18}
                  role="presentation"
                />
                <span>Star on GitHub</span>
                {stars !== null && (
                  <span className="ml-1 rounded-md bg-slate-800 px-1.5 py-0.5 text-xs font-medium text-slate-300">
                    {stars >= 1000 ? `${(stars / 1000).toFixed(1)}k` : stars}
                  </span>
                )}
              </a>
            </div>
          </div>
        </div>
      </nav>

      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/90"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          />
          <div className="absolute inset-y-0 right-0 w-full overflow-y-auto bg-gradient-to-b from-slate-900 to-slate-950 px-6 py-6 sm:max-w-sm border-l border-slate-800/60">
            <div className="flex items-center justify-between">
              <Wordmark />
              <button
                type="button"
                className="rounded-md p-2 text-slate-300 hover:bg-slate-800/60 transition-colors focus-ring"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
              >
                <XMarkIcon className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-6 space-y-2">
              {NAV.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  {...(item.external
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                  className="block px-3 py-3 text-base font-medium text-slate-200 hover:bg-slate-800/60 hover:text-white rounded-lg transition-colors focus-ring"
                  onClick={() => setMobileOpen(false)}
                >
                  {item.name}
                </a>
              ))}
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  track("Star GitHub");
                  setMobileOpen(false);
                }}
                className="block px-3 py-3 text-base font-medium text-slate-200 hover:bg-slate-800/60 hover:text-white rounded-lg transition-colors focus-ring"
              >
                Star on GitHub
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
