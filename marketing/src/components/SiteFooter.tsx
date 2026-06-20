"use client";
import React from "react";
import Image from "next/image";
import { track } from "../lib/analytics";

/**
 * Single shared site footer used by every route (P3/C4). Gives consistent
 * cross-linking between editions, personas, resources, and legal pages.
 */

const GITHUB_URL = "https://github.com/nodetool-ai/nodetool";
const DISCORD_URL = "https://discord.gg/WmQTWZRcYE";

type Col = { title: string; links: { name: string; href: string; external?: boolean; onClick?: () => void }[] };

const COLUMNS: Col[] = [
  {
    title: "Product",
    links: [
      { name: "Studio", href: "/studio" },
      { name: "Cloud", href: "/cloud" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { name: "Creatives", href: "/creatives" },
      { name: "Agents", href: "/agents" },
      { name: "Developers", href: "/developers" },
    ],
  },
  {
    title: "Resources",
    links: [
      { name: "Docs", href: "https://docs.nodetool.ai", external: true, onClick: () => track("Open Docs") },
      { name: "GitHub", href: GITHUB_URL, external: true, onClick: () => track("Star GitHub") },
      { name: "Discord", href: DISCORD_URL, external: true, onClick: () => track("Join Discord") },
    ],
  },
  {
    title: "Legal",
    links: [
      { name: "Imprint", href: "/imprint" },
      { name: "Privacy", href: "/privacy" },
      { name: "Terms", href: "/terms" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="relative border-t border-slate-800/50 bg-slate-950/80">
      <div className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-blue-800/40 to-transparent" />
      <div className="mx-auto max-w-7xl px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <a href="/" className="inline-flex items-center gap-2 focus-ring rounded" aria-label="NodeTool home">
              <Image
                src="/logo_small.png"
                alt=""
                width={32}
                height={32}
                className="h-8 w-8 brightness-0 invert"
              />
              <span className="text-lg font-bold tracking-widest text-white">
                nodetool
              </span>
            </a>
            <p className="mt-3 max-w-xs text-sm text-slate-300">
              The open creative AI workspace. Every model, your keys, your
              canvas.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                {col.title}
              </h2>
              <ul className="mt-3 space-y-2">
                {col.links.map((link) => (
                  <li key={link.name}>
                    <a
                      href={link.href}
                      {...(link.external
                        ? { target: "_blank", rel: "noopener noreferrer" }
                        : {})}
                      onClick={link.onClick}
                      className="text-sm text-slate-300 transition-colors hover:text-white focus-ring rounded"
                    >
                      {link.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-slate-800/50 pt-6 sm:flex-row">
          <p className="flex items-center gap-2 text-sm text-slate-300">
            <span className="text-rose-400" aria-hidden>
              ♥
            </span>
            Open source today. The future is yours to build.
          </p>
          <p className="text-xs text-slate-400">AGPL-3.0 · NodeTool</p>
        </div>
      </div>
    </footer>
  );
}
