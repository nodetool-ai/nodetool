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
    intent: "Desktop app",
    name: "Studio",
    href: "/studio",
    body: "Runs directly on your computer. Keeps your files and settings private on your hard drive, with optional offline support.",
    icon: Monitor,
    accent: "text-amber-300",
    chip: "border-amber-500/30 bg-amber-500/10",
  },
  {
    intent: "In your browser",
    name: "Cloud",
    href: "/cloud",
    body: "Runs in your web browser with zero installation needed. The fastest way to jump in and start creating. Currently in alpha.",
    icon: Cloud,
    accent: "text-blue-300",
    chip: "border-blue-500/30 bg-blue-500/10",
  },
  {
    intent: "For creators",
    name: "Creatives",
    href: "/creatives",
    body: "Focus on the creative vision — images, video, voice — and let the software handle the technical plumbing.",
    icon: Sparkles,
    accent: "text-rose-300",
    chip: "border-rose-500/30 bg-rose-500/10",
  },
  {
    intent: "For developers",
    name: "Developers",
    href: "/developers",
    body: "Connect custom scripts, automate tasks, and integrate your own code into the visual canvas, through the SDK, the CLI, or an MCP server.",
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
            Choose the setup that fits your workflow.
          </h2>
          <p className="mt-4 text-lg text-slate-400 leading-relaxed max-w-2xl">
            Whether you use the desktop app or the browser version, you get
            the exact same features, tools, and capabilities: the same agent,
            the same workflows, the same models.
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
