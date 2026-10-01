import React from "react";
import { Cpu, FolderOpen, KeyRound } from "lucide-react";
import HeroDemoPlayer from "./HeroDemoPlayer";
import { EDITIONS } from "../data/editions";

interface StudioHeroProps {
  primaryAction: React.ReactNode;
  headingId: string;
}

// The /studio counterpart of NodeToolHero: the same centered pitch and reel
// frame, with copy and proof points about the desktop edition.
export default function StudioHero({
  primaryAction,
  headingId,
}: StudioHeroProps) {
  return (
    <section
      aria-labelledby={headingId}
      className="relative pb-16 pt-2 md:pb-24"
    >
      {/* Static glows, as on the home page. Animating blurred layers held
          Safari at a few frames per second (idle-animation.spec.ts). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-sky-500/20 blur-3xl"
        style={{
          WebkitMaskImage:
            "radial-gradient(circle at center, black 0%, transparent 65%)",
          maskImage:
            "radial-gradient(circle at center, black 0%, transparent 65%)",
        }}
      />

      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
            {EDITIONS.studio.eyebrow}
          </span>

          <h1
            id={headingId}
            className="mt-6 text-balance text-4xl font-bold leading-[1.05] tracking-tight text-slate-50 sm:text-6xl lg:text-7xl"
          >
            Make the work.{" "}
            <span className="text-sky-200">Keep the project.</span>
          </h1>

          <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-slate-300 sm:text-xl">
            Create images, video, audio, and text with agents that work in
            NodeTool&apos;s editors. Revise the storyboard, script, layers, and
            timeline yourself, and keep the project for the next job.
          </p>

          <div className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
            {primaryAction}
            <a
              href="#editable-project"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-slate-700 bg-slate-900/60 px-6 py-3 text-sm font-semibold text-slate-100 transition-colors hover:border-slate-500 hover:bg-slate-800/60 focus-ring sm:w-auto"
            >
              See an editable project
            </a>
          </div>

          <p className="mt-4 text-xs text-slate-400">
            Free and open source, AGPL-3.0. macOS, Windows, and Linux.{" "}
            <span className="font-medium text-slate-200">
              {EDITIONS.studio.recommendation}
            </span>
          </p>
        </div>

        <div className="relative mx-auto mt-14 max-w-6xl sm:mt-16">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-x-8 -top-10 bottom-10 -z-10 rounded-[3rem] bg-gradient-to-b from-blue-500/25 via-sky-500/10 to-transparent blur-3xl"
          />
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-2 shadow-2xl shadow-black/70">
            <HeroDemoPlayer
              mediaBase="/hero-sizzle"
              alt="NodeTool Studio: one brief becomes a project across the agent chat, storyboard, graph canvas, sketch, script and timeline"
            />
          </div>
          <p className="mt-4 text-center text-sm text-slate-400">
            Direct, board, render, compare, paint, voice, cut: recorded in the
            desktop app.
          </p>
        </div>

        <ul className="mx-auto mt-10 grid max-w-5xl grid-cols-1 gap-3 text-sm font-medium text-slate-300 sm:grid-cols-3">
          <li className="flex items-center justify-center gap-2 rounded-xl border border-slate-800/80 bg-slate-900/40 px-4 py-3">
            <FolderOpen className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
            Project files on your disk
          </li>
          <li className="flex items-center justify-center gap-2 rounded-xl border border-slate-800/80 bg-slate-900/40 px-4 py-3">
            <Cpu className="h-4 w-4 shrink-0 text-fuchsia-400" aria-hidden />
            Local models via Ollama and MLX
          </li>
          <li className="flex items-center justify-center gap-2 rounded-xl border border-slate-800/80 bg-slate-900/40 px-4 py-3">
            <KeyRound className="h-4 w-4 shrink-0 text-blue-400" aria-hidden />
            Your own provider keys
          </li>
        </ul>
      </div>
    </section>
  );
}
