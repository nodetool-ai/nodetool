import React from "react";
import { ArrowRight, Bot, Download, Film, FolderOpen, Layers, Plug, SlidersHorizontal } from "lucide-react";
import HeroDemoPlayer from "./HeroDemoPlayer";
import { SmartDownloadButton } from "../app/SmartDownloadButton";
import { track } from "../lib/analytics";

/** A short overview, with each point linked to its detailed page. */
const pillars = [
  {
    title: "Edit video, build workflows",
    body: "Work in the timeline or connect nodes for more control and repeatable tasks.",
    href: "/node-based-workflows",
    linkLabel: "Explore node workflows",
    icon: Film,
  },
  {
    title: "Create with an agent",
    body: "Ask the agent to build and edit your project, then adjust it yourself.",
    href: "/agents",
    linkLabel: "See how the agent works",
    icon: Bot,
  },
  {
    title: "Work across media",
    body: "Create images, audio, storyboards and 3D scenes alongside your video.",
    href: "/studio#surfaces",
    linkLabel: "Explore the editors",
    icon: Layers,
  },
  {
    title: "Choose your models",
    body: "Connect your provider accounts or run supported models locally.",
    href: "/models",
    linkLabel: "Browse supported models",
    icon: SlidersHorizontal,
  },
  {
    title: "Save projects locally",
    body: "Save your work on your computer with the free, open-source desktop app.",
    href: "/studio",
    linkLabel: "About the desktop app",
    icon: FolderOpen,
  },
  {
    title: "Connect other tools",
    body: "Run workflows through the API or command line, or connect coding agents through MCP.",
    href: "/developers",
    linkLabel: "For developers",
    icon: Plug,
  },
];

export default function NodeToolHero() {
  return (
    <div className="relative w-full text-slate-200">
      <div className="hero-rise mx-auto flex max-w-4xl flex-col items-center text-center">
        {/* The category line stays visible above the headline, and the
            metadata stays category-led (NARRATIVE.md § Positioning line). */}
        <p className="inline-flex max-w-full items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-blue-300 sm:text-[11px] sm:tracking-[0.18em]">
          Open-source agent-first creative workspace
        </p>

        <h1
          id="hero-title"
          className="mt-5 text-balance text-[2.125rem] font-bold leading-[1.05] tracking-tight text-slate-50 sm:mt-6 sm:text-6xl lg:text-7xl"
        >
          Create with AI.{" "}
          <span className="text-sky-200">Make it your own.</span>
        </h1>

        <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-slate-300 sm:mt-6 sm:text-xl">
          An AI video editor with an agent that helps you create and edit.
          Work in the timeline, or connect nodes to build reusable workflows.
        </p>

        <div className="mt-7 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
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
          Free and open source,{" "}
          <span className="whitespace-nowrap">AGPL-3.0.</span> macOS, Windows,
          and Linux. Connect a supported provider account or run supported models
          locally. Provider charges may apply.
        </p>
      </div>

      {/* The reel, full width under the pitch. A soft glow sits behind the
          frame so the video reads as the subject of the section. */}
      <div className="hero-rise-delayed relative mx-auto mt-10 max-w-6xl sm:mt-16">
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
        <p className="mt-4 text-pretty text-center text-sm text-slate-400">
          One sentence becomes a short film. The agent outlines the story,
          designs the characters, draws a storyboard, generates the clips, and
          edits them together.
        </p>
      </div>

      <ul
        aria-label="What you can do with NodeTool"
        className="mx-auto mt-8 grid max-w-5xl grid-cols-1 gap-3 text-sm text-slate-300 sm:mt-10 sm:grid-cols-3"
      >
        {pillars.map((pillar) => (
          <li key={pillar.title}>
            <a
              href={pillar.href}
              className="group flex h-full flex-col rounded-xl border border-slate-800/80 bg-slate-900/40 px-4 py-4 transition-colors hover:border-slate-600 hover:bg-slate-900/70 focus-ring"
            >
              <span className="flex items-center gap-2 text-base font-semibold text-slate-100">
                <pillar.icon className="h-4 w-4 shrink-0 text-blue-400" aria-hidden />
                {pillar.title}
                <ArrowRight
                  className="ml-auto h-4 w-4 text-slate-500 transition-colors group-hover:text-slate-200"
                  aria-hidden
                />
              </span>
              <span className="mt-2 leading-relaxed text-slate-400">{pillar.body}</span>
              <span className="mt-3 text-xs font-medium text-blue-300">{pillar.linkLabel}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
