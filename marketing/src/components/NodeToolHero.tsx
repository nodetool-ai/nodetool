import React from "react";
import { Download, Code2, KeyRound, Layers } from "lucide-react";
import HeroDemoPlayer from "./HeroDemoPlayer";
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
            <span>Open-source</span>{" "}
            <span className="bg-gradient-to-r from-rose-400 via-fuchsia-400 to-amber-300 bg-clip-text pb-1 text-transparent">
              agent-first creative workspace
            </span>
          </h1>
        </div>

        <div className="hero-rise lg:col-span-5">
          <p className="max-w-lg text-lg leading-relaxed text-slate-300">
            Create and edit images, video, audio, and text with agents that work
            alongside you. Describe what you want, let the agent build it, then
            take over whenever you like. Refine a shot, try a different voice, or
            rework the cut, yourself or with the agent.
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
          <div
            aria-hidden
            className="absolute -inset-6 -z-10 rounded-[2rem] opacity-40 blur-3xl"
            style={{
              background:
                "radial-gradient(60% 60% at 50% 0%, rgba(168,85,247,0.35), transparent 60%), radial-gradient(50% 60% at 100% 100%, rgba(244,114,182,0.25), transparent 60%), radial-gradient(50% 60% at 0% 100%, rgba(59,130,246,0.25), transparent 60%)",
            }}
          />
          <div className="rounded-2xl border border-slate-700/60 bg-slate-900/80 p-1.5 shadow-2xl shadow-black/60 ring-1 ring-white/5 backdrop-blur">
            <HeroDemoPlayer
              alt="NodeTool: one sentence becomes a storyboard, rendered stills and clips, a cut on the timeline, and a finished film"
              caption="One sentence becomes a storyboard, rendered stills and clips, a cut on the timeline, and a finished film. Recorded in the app — open it full screen to read the panels."
            />
          </div>
        </div>
        <div className="grid gap-6 border-t border-slate-800 pt-6 sm:grid-cols-2 lg:col-span-12">
          <p className="max-w-xl text-sm leading-relaxed text-slate-400">
            You get an editable project, not just a finished file. Your
            workflows, assets, and edits stay together, so you can inspect how
            something was made and change individual parts without starting
            over.
          </p>

          <p className="max-w-xl text-sm leading-relaxed text-slate-400">
            Run local models or connect cloud providers with your own API keys.
            Choose your models and pay providers directly.
          </p>
        </div>
      </div>
    </div>
  );
}
