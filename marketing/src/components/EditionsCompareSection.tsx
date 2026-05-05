"use client";
import React from "react";
import { motion } from "framer-motion";
import {
  Cpu,
  Cloud,
  Check,
  X,
  Download,
  Globe,
} from "lucide-react";

interface EditionsCompareSectionProps {
  reducedMotion?: boolean;
  /** Highlight one of the editions as the user's current page. */
  highlight?: "studio" | "cloud" | null;
}

type Row = {
  label: string;
  studio: { value: string; ok: boolean };
  cloud: { value: string; ok: boolean };
};

const rows: Row[] = [
  {
    label: "Where it runs",
    studio: { value: "Your machine (macOS, Windows, Linux)", ok: true },
    cloud: { value: "Hosted by us — open in any browser", ok: true },
  },
  {
    label: "Install required",
    studio: { value: "Desktop app + ~20GB for local models", ok: false },
    cloud: { value: "None — sign in and start building", ok: true },
  },
  {
    label: "Local LLMs (Ollama, MLX, GGUF)",
    studio: { value: "Yes — runs entirely on your hardware", ok: true },
    cloud: { value: "Not available — cloud APIs only", ok: false },
  },
  {
    label: "Bring your own API keys (BYOK)",
    studio: { value: "All providers — keys stored locally", ok: true },
    cloud: { value: "All providers — keys stored encrypted", ok: true },
  },
  {
    label: "Works offline",
    studio: { value: "Yes — fully offline with local models", ok: true },
    cloud: { value: "No — needs an internet connection", ok: false },
  },
  {
    label: "Where your data lives",
    studio: { value: "On your disk only", ok: true },
    cloud: { value: "Our managed storage (encrypted at rest)", ok: true },
  },
  {
    label: "GPU requirements",
    studio: { value: "Recommended for local models", ok: false },
    cloud: { value: "None — we run the heavy lifting", ok: true },
  },
  {
    label: "Updates",
    studio: { value: "You install new releases", ok: false },
    cloud: { value: "Always on the latest version", ok: true },
  },
  {
    label: "Source code",
    studio: { value: "100% open source (AGPL-3.0)", ok: true },
    cloud: { value: "100% open source (AGPL-3.0) — self-host any time", ok: true },
  },
  {
    label: "Cost",
    studio: { value: "Free — pay only for the cloud APIs you use", ok: true },
    cloud: { value: "Subscription + your own API spend (BYOK)", ok: false },
  },
];

function Cell({ ok, value }: { ok: boolean; value: string }) {
  return (
    <div className="flex items-start gap-2">
      {ok ? (
        <Check className="h-4 w-4 mt-0.5 shrink-0 text-emerald-400" strokeWidth={2.5} />
      ) : (
        <X className="h-4 w-4 mt-0.5 shrink-0 text-slate-500" strokeWidth={2.5} />
      )}
      <span className="text-sm text-slate-300 leading-relaxed">{value}</span>
    </div>
  );
}

function EditionHeader({
  kind,
  highlighted,
}: {
  kind: "studio" | "cloud";
  highlighted: boolean;
}) {
  const isStudio = kind === "studio";
  const Icon = isStudio ? Cpu : Cloud;
  const title = isStudio ? "NodeTool Studio" : "NodeTool Cloud";
  const tagline = isStudio
    ? "Local-first desktop app"
    : "Hosted in the browser · Alpha preview";
  const ringColor = isStudio
    ? "ring-amber-500/40 border-amber-500/30"
    : "ring-blue-500/40 border-blue-500/30";
  const dotColor = isStudio ? "bg-amber-400" : "bg-blue-400";

  return (
    <div
      className={`flex items-center justify-between gap-4 p-5 border-b border-slate-800/60 ${
        highlighted ? `ring-1 ${ringColor}` : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-200">
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div>
          <h3 className="text-base font-semibold tracking-tight text-white flex items-center gap-2">
            {title}
            {!isStudio && (
              <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-200">
                Alpha
              </span>
            )}
            {highlighted && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-200 bg-slate-800/80 border border-slate-700`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
                You are here
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">{tagline}</p>
        </div>
      </div>
      {isStudio ? (
        <a
          href="/studio"
          className="hidden sm:inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 text-xs font-semibold text-amber-200 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Download Studio
        </a>
      ) : (
        <a
          href="/cloud"
          className="hidden sm:inline-flex items-center gap-1.5 rounded-md bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 px-3 py-1.5 text-xs font-semibold text-blue-200 transition-colors"
        >
          <Globe className="h-3.5 w-3.5" />
          Open Cloud
        </a>
      )}
    </div>
  );
}

export default function EditionsCompareSection({
  reducedMotion = false,
  highlight = null,
}: EditionsCompareSectionProps) {
  return (
    <section
      id="editions"
      aria-labelledby="editions-title"
      className="relative py-24 scroll-mt-24"
    >
      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <header className="mb-12 max-w-3xl">
          <div className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">
            <span className="h-px w-8 bg-amber-300/60" />
            Two editions, one open-source codebase
          </div>
          <motion.h2
            id="editions-title"
            initial={reducedMotion ? {} : { opacity: 0, y: 16 }}
            whileInView={reducedMotion ? {} : { opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white"
          >
            Studio runs on your machine.
            <br />
            <span className="text-slate-300">Cloud runs in your browser.</span>
          </motion.h2>
          <motion.p
            initial={reducedMotion ? {} : { opacity: 0, y: 16 }}
            whileInView={reducedMotion ? {} : { opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="mt-4 text-lg text-slate-400 leading-relaxed max-w-2xl"
          >
            Same workflows, same nodes, same agent system. Pick the runtime that
            fits how you want to work — and switch any time. Both editions are
            AGPL-3.0 open source; Cloud is just our managed hosting of the same
            code you can run yourself.
          </motion.p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Studio card */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 overflow-hidden">
            <EditionHeader kind="studio" highlighted={highlight === "studio"} />
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-300 leading-relaxed">
                <strong className="text-white">Best for:</strong> privacy-first
                builders, offline work, large local model collections, and
                anyone with a capable GPU or Apple Silicon.
              </p>
              <ul className="space-y-2.5">
                {rows.map((r) => (
                  <li key={`s-${r.label}`} className="grid grid-cols-[140px_1fr] gap-3">
                    <span className="text-xs uppercase tracking-wider text-slate-500 mt-0.5">
                      {r.label}
                    </span>
                    <Cell ok={r.studio.ok} value={r.studio.value} />
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Cloud card */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 overflow-hidden">
            <EditionHeader kind="cloud" highlighted={highlight === "cloud"} />
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-300 leading-relaxed">
                <strong className="text-white">Best for:</strong> teams that
                want to start in seconds, work from any device, and skip GPU
                setup — while still using their own API keys for every provider.
              </p>
              <ul className="space-y-2.5">
                {rows.map((r) => (
                  <li key={`c-${r.label}`} className="grid grid-cols-[140px_1fr] gap-3">
                    <span className="text-xs uppercase tracking-wider text-slate-500 mt-0.5">
                      {r.label}
                    </span>
                    <Cell ok={r.cloud.ok} value={r.cloud.value} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <p className="mt-10 text-sm text-slate-400 text-center max-w-2xl mx-auto">
          Not sure? Start with{" "}
          <a href="/cloud" className="text-blue-300 hover:text-blue-200 underline underline-offset-2">
            Cloud
          </a>{" "}
          to try it in 30 seconds, then move to{" "}
          <a href="/studio" className="text-amber-300 hover:text-amber-200 underline underline-offset-2">
            Studio
          </a>{" "}
          when you want full local control. Your workflows are portable between
          both.
        </p>
      </div>
    </section>
  );
}
