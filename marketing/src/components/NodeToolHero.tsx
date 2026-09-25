import React from "react";
import { Download, Code2, KeyRound, Layers } from "lucide-react";
import HeroDemoPlayer from "./HeroDemoPlayer";
import { SmartDownloadButton } from "../app/SmartDownloadButton";

export default function NodeToolHero() {
  return (
    <div className="relative w-full text-slate-200">
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        <div className="hero-rise lg:col-span-12">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
            Agents build. You edit.
          </span>

          <h1
            id="hero-title"
            className="mt-4 text-balance text-4xl font-bold leading-tight tracking-tight text-slate-50 sm:text-5xl lg:text-6xl"
          >
            Open-source agent-first creative workspace
          </h1>
        </div>

        <div className="hero-rise lg:col-span-5">
          <p className="max-w-lg text-lg leading-relaxed text-slate-300">
            Create images, video, audio, and text with agents that work
            alongside you. Describe what you want, let the agent build it, then
            take over whenever you like.
          </p>

          <div className="mt-6 flex">
            <SmartDownloadButton
              icon={<Download className="h-5 w-5" />}
              classNameOverride="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition-all hover:bg-blue-500 hover:shadow-blue-900/60"
            />
          </div>

          {/* Trust line, directly under the CTA (NARRATIVE.md § Positioning
              line). One number we actually have, no adjectives. */}
          <p className="mt-3 text-xs text-slate-400">
            Free and open source, AGPL-3.0. macOS, Windows, and Linux.
          </p>

          <ul className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-slate-300">
            <li className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-fuchsia-400" />
              Script, storyboard, sketch, timeline, 3D
            </li>
            <li className="flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5 text-emerald-400" />
              Your own keys, provider list prices
            </li>
            <li className="flex items-center gap-1.5">
              <Code2 className="h-3.5 w-3.5 text-blue-400" />
              Open source, you own the files
            </li>
          </ul>
        </div>

        {/* Right: product screenshot */}
        <div className="hero-rise-delayed relative lg:col-span-7">
          <div className="rounded-2xl border border-slate-700/60 bg-slate-900/80 p-1.5 shadow-2xl shadow-black/60 ring-1 ring-white/5 backdrop-blur">
            <HeroDemoPlayer
              mediaBase="/hero-sizzle"
              alt="NodeTool: one brief becomes a project across the agent chat, storyboard, graph canvas, sketch, script and timeline"
              caption="Direct, board, render, compare, paint, voice, cut: one workspace, recorded in the app."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
