"use client";
/**
 * One workflow, two views: the graph above, the mini app it becomes below.
 *
 * Both halves are the same shipped example — the graph comes from the
 * generated template entry, the screenshot from the app that binds that
 * workflow — so "this graph is that app" is true by construction rather than
 * by pairing two nice-looking pictures.
 *
 * The positioning plan asked for a drag-to-reveal split. The two assets have
 * no shared aspect ratio (a wide graph against a tall app page), so one
 * frame either crops the app mid-sentence or shrinks it into a column. They
 * are stacked instead, each whole.
 */
import React, { useMemo } from "react";
import { ArrowDown, Layers, MousePointerClick } from "lucide-react";

import WorkflowGraphFromJson from "./WorkflowGraphFromJson";
import { templateEntries } from "../data/templates";
import { miniAppEntries } from "../data/miniApps";

/** The pair on show. Small graph, featured app, screenshot committed. */
const APP_SLUG = "photo-studio";

function Chip({
  icon: Icon,
  children,
}: {
  icon: typeof Layers;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1 text-xs text-slate-300">
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {children}
    </span>
  );
}

export default function GraphToAppSplit() {
  const pair = useMemo(() => {
    const app = miniAppEntries.find((a) => a.slug === APP_SLUG);
    const workflow = app?.workflows?.[0];
    const template = templateEntries.find((t) => t.slug === workflow?.slug);
    if (!app?.screenshot || !template) return null;
    return { app, template, screenshot: app.screenshot };
  }, []);

  // A graph and a screenshot with nothing to pair is a section with nothing to
  // say — the generated data changed, and the page should not guess.
  if (!pair) return null;
  const { app, template, screenshot } = pair;

  return (
    <section
      id="graph-to-app"
      aria-labelledby="graph-to-app-title"
      className="relative py-24 scroll-mt-24 overflow-clip-safe"
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[500px] bg-blue-900/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-5xl px-6 lg:px-8">
        <div className="mb-10 text-center max-w-3xl mx-auto">
          <h2
            id="graph-to-app-title"
            className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-6"
          >
            Wrap the graph in a screen
          </h2>
          <p className="text-lg text-slate-300">
            A workflow is for you. An app is for everyone else: the same graph
            with inputs, a run button, and a place for the result. Here is{" "}
            {template.name}, and the app it became.
          </p>
        </div>

        <figure className="overflow-hidden rounded-2xl border border-slate-800/60 bg-slate-950/70 ring-1 ring-white/5">
          <figcaption className="flex items-center gap-3 border-b border-white/5 bg-slate-900/80 px-4 py-3">
            <Chip icon={Layers}>The workflow</Chip>
            <span className="ml-auto hidden text-xs text-slate-500 sm:block">
              {template.name}
            </span>
          </figcaption>
          <div className="overflow-x-auto">
            <WorkflowGraphFromJson
              graph={template.graph}
              ariaLabel={`${template.name} workflow graph`}
            />
          </div>
        </figure>

        <div className="flex justify-center py-6" aria-hidden>
          <span className="rounded-full border border-slate-700 bg-slate-950/80 p-2 text-slate-400">
            <ArrowDown className="h-5 w-5" />
          </span>
        </div>

        <figure className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-slate-800/60 bg-slate-950/70 ring-1 ring-white/5">
          <figcaption className="flex items-center gap-3 border-b border-white/5 bg-slate-900/80 px-4 py-3">
            <Chip icon={MousePointerClick}>The app</Chip>
            <span className="ml-auto hidden text-xs text-slate-500 sm:block">
              {app.name}
            </span>
          </figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={screenshot}
            alt={`${app.name} mini app`}
            className="block h-auto w-full"
            loading="lazy"
            decoding="async"
          />
        </figure>

        <p className="mt-8 text-slate-300">
          Nothing is regenerated in between. The app names the workflow&apos;s
          inputs and outputs, so a change to the graph shows up in the screen,
          and an agent can place the widgets for you.{" "}
          <a
            href={app.route}
            className="text-blue-400 hover:text-blue-300 focus-ring"
          >
            Open {app.name} →
          </a>
        </p>
      </div>
    </section>
  );
}
