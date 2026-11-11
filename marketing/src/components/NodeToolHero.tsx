import React from "react";
import { ArrowRight, Bot, Download, Film, Layers } from "lucide-react";
import HeroDemoPlayer from "./HeroDemoPlayer";
import { SmartDownloadButton } from "../app/SmartDownloadButton";
import { track } from "../lib/analytics";

/*
 * Three cards, each linked to the page that owns it (site-editorial.spec.md
 * § Homepage). Node workflows have their own section below the hero. Models,
 * local projects, other media and the developer surfaces (API, CLI, MCP) live
 * on their own pages. The timeline card rests on packages/timeline
 * staleSet.ts: a clip bound to a workflow is stale when one of its inputs
 * changes.
 */
const pillars = [
  {
    title: "Films",
    body: "Write the script, storyboard every shot, and cut the clips on a timeline, all in one project.",
    href: "/studio",
    linkLabel: "About the desktop app",
    icon: Film,
  },
  {
    title: "The agent",
    body: "Tell the agent what to change in plain words. It edits the project, and you can take over at any point.",
    href: "/agents",
    linkLabel: "See how the agent works",
    icon: Bot,
  },
  {
    title: "A live timeline",
    body: "Bind a workflow to a clip. Change one of its inputs and the clip shows it is out of date, so you regenerate that take while the rest of the cut stays.",
    href: "/ai-video-editor",
    linkLabel: "About the video editor",
    icon: Layers,
  },
];

export default function NodeToolHero() {
  return (
    <div className="relative w-full text-slate-200">
      <div className="hero-rise mx-auto flex max-w-4xl flex-col items-center text-center">
        {/* The category line stays visible above the headline
            (NARRATIVE.md § Positioning line). */}
        <p className="inline-flex max-w-full items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-blue-300 sm:text-[11px] sm:tracking-[0.18em]">
          Open-source AI film studio
          {/* The second half wraps the badge onto two lines on a phone. */}
          <span className="hidden sm:inline">&nbsp;· agent + node workflows</span>
        </p>

        <h1
          id="hero-title"
          className="mt-5 text-balance text-[2.125rem] font-bold leading-[1.05] tracking-tight text-slate-50 sm:mt-6 sm:text-6xl lg:text-7xl"
        >
          Turn one sentence into{" "}
          <span className="text-sky-200">a short film you can edit.</span>
        </h1>

        <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-slate-300 sm:mt-6 sm:text-xl">
          The agent writes the story, draws a still for every shot, and cuts
          the clips on a timeline. Approve each still
          before you pay for its clip, reshoot any shot on its own, and save
          what works as a workflow you can run again.
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
            Try it in your browser
          </a>
        </div>

        {/* Setup line, directly under the CTA (NARRATIVE.md § Positioning
            line): how the agent gets a model, then the trust facts. Plan
            sign-in is Studio only (SubscriptionSection), and Cloud is still
            in alpha (site-editorial.spec.md § Global rules, honest limits). */}
        <p className="mt-5 max-w-xl text-pretty text-sm leading-relaxed text-slate-300">
          In the desktop app, sign in with your ChatGPT or Claude plan and the
          agent runs on it. Or add your own provider keys and pay list price,
          with nothing added.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Free and open source for macOS, Windows, and Linux. The browser
          version is in alpha.
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
        aria-label="What NodeTool makes"
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
