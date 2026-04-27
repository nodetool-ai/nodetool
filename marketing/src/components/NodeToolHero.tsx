import React from "react";
import { motion } from "framer-motion";
import { Download, Play, Code2, ShieldCheck, Monitor } from "lucide-react";
import { SmartDownloadButton } from "../app/SmartDownloadButton";

export default function NodeToolHero() {
  return (
    <div className="relative w-full text-slate-200">
      {/* Background glows */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/3 h-[28rem] w-[28rem] rounded-full bg-blue-500/15 blur-[120px]" />
        <div className="absolute -bottom-40 right-0 h-[26rem] w-[26rem] rounded-full bg-fuchsia-500/10 blur-[120px]" />
        <div className="absolute top-1/2 -right-20 h-[20rem] w-[20rem] rounded-full bg-amber-500/10 blur-[120px]" />
      </div>

      <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12">
        {/* Left: copy */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="lg:col-span-5"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
            Open Source
            <span className="text-blue-500/60">•</span>
            Local First
          </span>

          <h1
            id="hero-title"
            className="mt-6 text-5xl font-bold leading-[1.05] tracking-tight text-white md:text-6xl"
          >
            Build AI Workflows.
            <br />
            <span className="bg-gradient-to-r from-rose-400 via-fuchsia-400 to-amber-300 bg-clip-text text-transparent">
              Run Them Locally.
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-400 md:text-lg">
            Nodetool is a local-first AI workflow and agent builder. Connect
            models and tools with visual nodes, run multimodal pipelines, and
            deploy anywhere.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <SmartDownloadButton
              icon={<Download className="h-5 w-5" />}
              classNameOverride="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition-all hover:bg-blue-500 hover:shadow-blue-900/60"
            />
            <a
              href="#demo-video"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-6 py-3.5 text-sm font-semibold text-slate-100 transition-all hover:border-slate-500 hover:bg-slate-800/60"
            >
              <Play className="h-4 w-4" />
              See How It Works
            </a>
          </div>

          <ul className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-slate-400">
            <li className="flex items-center gap-1.5">
              <Code2 className="h-3.5 w-3.5 text-blue-400" />
              Open Source
            </li>
            <li className="text-slate-700">•</li>
            <li className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              Privacy-First
            </li>
            <li className="text-slate-700">•</li>
            <li className="flex items-center gap-1.5">
              <Monitor className="h-3.5 w-3.5 text-slate-300" />
              macOS · Windows · Linux
            </li>
          </ul>
        </motion.div>

        {/* Right: product screenshot */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: "easeOut" }}
          className="relative lg:col-span-7"
        >
          <div
            aria-hidden
            className="absolute -inset-6 -z-10 rounded-[2rem] opacity-70 blur-3xl"
            style={{
              background:
                "radial-gradient(60% 60% at 50% 0%, rgba(168,85,247,0.35), transparent 60%), radial-gradient(50% 60% at 100% 100%, rgba(244,114,182,0.25), transparent 60%), radial-gradient(50% 60% at 0% 100%, rgba(59,130,246,0.25), transparent 60%)",
            }}
          />
          <div className="rounded-2xl border border-slate-700/60 bg-slate-900/80 p-1.5 shadow-2xl shadow-black/60 ring-1 ring-white/5 backdrop-blur">
            <img
              src="/screen_canvas.png"
              alt="Nodetool workflow editor"
              className="block w-full rounded-xl"
              loading="eager"
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
