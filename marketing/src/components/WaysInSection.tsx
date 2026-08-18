"use client";
import React from "react";
import {
  Monitor,
  Cloud,
  Sparkles,
  Code2,
  Megaphone,
  ArrowRight,
} from "lucide-react";

/**
 * One workspace, several doors. Routes visitors by intent to the five entry
 * pages — Studio, Cloud, Creatives, Developers, Marketing — framed as ways
 * to use the same product, not as separate products.
 */

const entries = [
  {
    intent: "Run it on your machine",
    name: "Studio",
    href: "/studio",
    body: "The desktop app: your files, your local models, your GPU. The most control, fully offline if you want.",
    icon: Monitor,
    accent: "text-amber-300",
    chip: "border-amber-500/30 bg-amber-500/10",
  },
  {
    intent: "Try it in the browser",
    name: "Cloud",
    href: "/cloud",
    body: "Nothing to install. Sign in and start building — currently in alpha, and the fastest way to see what NodeTool is.",
    icon: Cloud,
    accent: "text-blue-300",
    chip: "border-blue-500/30 bg-blue-500/10",
  },
  {
    intent: "Make visual work",
    name: "Creatives",
    href: "/creatives",
    body: "Start from the piece you want — images, video, music — and let the agent handle the models and the plumbing.",
    icon: Sparkles,
    accent: "text-rose-300",
    chip: "border-rose-500/30 bg-rose-500/10",
  },
  {
    intent: "Build and integrate",
    name: "Developers",
    href: "/developers",
    body: "SDK, CLI, custom nodes, and an MCP server: one execution layer under the canvas, the agent, and your code.",
    icon: Code2,
    accent: "text-violet-300",
    chip: "border-violet-500/30 bg-violet-500/10",
  },
  {
    intent: "Produce campaigns",
    name: "Marketing",
    href: "/marketing",
    body: "Turn a brief into a production workflow you run again for every product, market, and variant.",
    icon: Megaphone,
    accent: "text-emerald-300",
    chip: "border-emerald-500/30 bg-emerald-500/10",
  },
];

export default function WaysInSection() {
  return (
    <section
      id="ways-in"
      aria-labelledby="ways-in-title"
      className="relative py-24 scroll-mt-24"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <header className="scroll-fade mb-12 max-w-3xl">
          <div className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-blue-300/80">
            <span className="h-px w-8 bg-blue-300/60" />
            One workspace, several doors
          </div>
          <h2
            id="ways-in-title"
            className="text-3xl md:text-5xl font-bold tracking-tight text-white"
          >
            Pick the way in that fits you.
          </h2>
          <p className="mt-4 text-lg text-slate-400 leading-relaxed max-w-2xl">
            Studio, Cloud, and the pages for creatives, developers, and
            marketers are not five products. They are five ways to use the
            same open-source workspace: the same agent, the same workflows,
            the same models.
          </p>
        </header>

        <div className="scroll-fade grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((e) => (
            <a
              key={e.name}
              href={e.href}
              className="group relative flex flex-col rounded-2xl border border-slate-800/70 bg-slate-950/50 p-6 ring-1 ring-white/5 transition-all hover:border-slate-600 hover:bg-slate-900/60 focus-ring"
            >
              <div
                className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg border ${e.chip} ${e.accent}`}
              >
                <e.icon className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                {e.intent}
              </div>
              <h3 className="mt-1.5 text-lg font-semibold text-white">
                {e.name}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {e.body}
              </p>
              <span
                className={`mt-4 inline-flex items-center gap-1.5 text-sm font-semibold ${e.accent}`}
              >
                Go to {e.name}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
