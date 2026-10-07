import React from "react";
import { Download, Code2, KeyRound, Layers } from "lucide-react";
import HeroDemoPlayer from "./HeroDemoPlayer";
import { SmartDownloadButton } from "../app/SmartDownloadButton";
import { track } from "../lib/analytics";

export default function NodeToolHero() {
  return (
    <div className="relative w-full text-slate-200">
      <div className="hero-rise mx-auto flex max-w-4xl flex-col items-center text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
          Open-source creative workspace
        </span>

        <h1
          id="hero-title"
          className="mt-6 text-balance text-4xl font-bold leading-[1.05] tracking-tight text-slate-50 sm:text-6xl lg:text-7xl"
        >
          Make video, images, and audio with an AI agent.{" "}
          <span className="text-sky-200">Then edit every part.</span>
        </h1>

        <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-slate-300 sm:text-xl">
          NodeTool is a free app for making media with AI. Tell the built-in
          agent what you want. It writes the script, plans the shots, generates
          them with the AI models you choose, and edits them together. You get
          a project you can open and change, not just a finished file.
        </p>

        <div className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
          <SmartDownloadButton
            icon={<Download className="h-5 w-5" />}
            classNameOverride="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition-all hover:bg-blue-500 hover:shadow-blue-900/60 focus-ring sm:w-auto"
          />
          <a
            href="https://app.nodetool.ai"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("Try Cloud")}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-6 py-3.5 text-sm font-semibold text-slate-100 transition-all hover:border-slate-500 hover:bg-slate-800/60 focus-ring sm:w-auto"
          >
            Try Cloud in your browser (alpha)
          </a>
        </div>

        {/* Trust line, directly under the CTA (NARRATIVE.md § Positioning
            line). One number we actually have, no adjectives. */}
        <p className="mt-4 text-xs text-slate-400">
          Free and open source, AGPL-3.0. macOS, Windows, and Linux.
        </p>
      </div>

      {/* The reel, full width under the pitch. A soft glow sits behind the
          frame so the video reads as the subject of the section. */}
      <div className="hero-rise-delayed relative mx-auto mt-14 max-w-6xl sm:mt-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-x-8 -top-10 bottom-10 -z-10 rounded-[3rem] bg-gradient-to-b from-blue-500/25 via-sky-500/10 to-transparent blur-3xl"
        />
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-2 shadow-2xl shadow-black/70">
          <HeroDemoPlayer
            mediaBase="/hero-flow"
            alt="NodeTool: one sentence becomes a beat sheet, entities, a storyboard of stills and clips, and a finished cut"
          />
        </div>
        <p className="mt-4 text-center text-sm text-slate-400">
          One sentence becomes a short film. The agent outlines the story,
          designs the characters, draws a storyboard, generates the clips, and
          edits them together.
        </p>
      </div>

      <ul className="mx-auto mt-10 grid max-w-5xl grid-cols-1 gap-3 text-sm font-medium text-slate-300 sm:grid-cols-3">
        <li className="flex items-center justify-center gap-2 rounded-xl border border-slate-800/80 bg-slate-900/40 px-4 py-3">
          <Layers className="h-4 w-4 shrink-0 text-fuchsia-400" aria-hidden />
          Editors for scripts, storyboards, drawing, video, 3D, and games
        </li>
        <li className="flex items-center justify-center gap-2 rounded-xl border border-slate-800/80 bg-slate-900/40 px-4 py-3">
          <KeyRound className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
          Your own AI provider accounts, with no markup
        </li>
        <li className="flex items-center justify-center gap-2 rounded-xl border border-slate-800/80 bg-slate-900/40 px-4 py-3">
          <Code2 className="h-4 w-4 shrink-0 text-blue-400" aria-hidden />
          Open source, and your projects are files you keep
        </li>
      </ul>
    </div>
  );
}
