import React from "react";
import {
  AppWindow,
  Blocks,
  Boxes,
  Code2,
  FolderOpen,
  LayoutTemplate,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";

/**
 * What is underneath the film, as one strip of routes. These used to be ten
 * homepage sections (app builder, node menu, asset and model managers, one
 * per editor); the homepage argues the film story, and the inventory lives on
 * the pages it links to (NARRATIVE.md § Message hierarchy).
 */

interface Route {
  name: string;
  href: string;
  body: string;
  icon: LucideIcon;
}

const routes: Route[] = [
  {
    name: "App builder",
    href: "/apps",
    body: "Give a workflow a screen: inputs, a Run button, a place for the result. Hand it to a teammate who never sees the canvas.",
    icon: AppWindow,
  },
  {
    name: "Node catalog",
    href: "/node-based-ai",
    body: "Hundreds of blocks for models, data, and files, plus one for every model on Replicate, fal.ai, and Kie.",
    icon: Blocks,
  },
  {
    name: "Templates and recipes",
    href: "/templates",
    body: "Shipped workflows to open, run, and change. A recipe chains several into one job.",
    icon: LayoutTemplate,
  },
  {
    name: "Models",
    href: "/models",
    body: "Every major provider on your keys, and open weights on your own machine through MLX, Ollama, and llama.cpp.",
    icon: Boxes,
  },
  {
    name: "Assets and local models",
    href: "/studio",
    body: "The desktop app keeps your files, your model library, and your keys on disk, and runs offline.",
    icon: FolderOpen,
  },
  {
    name: "Developers",
    href: "/developers",
    body: "The SDK, the CLI, and an MCP server that Claude Code and Cursor can call.",
    icon: Code2,
  },
];

export default function UnderneathSection() {
  return (
    <section
      id="underneath"
      aria-labelledby="underneath-title"
      className="relative py-20 scroll-mt-24"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <header className="scroll-fade mb-10 max-w-3xl">
          <div className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-blue-300/80">
            <span className="h-px w-8 bg-blue-300/60" />
            Underneath
          </div>
          <h2
            id="underneath-title"
            className="text-3xl md:text-4xl font-bold tracking-tight text-white"
          >
            The studio under the film
          </h2>
          <p className="mt-4 text-lg text-slate-400 leading-relaxed max-w-2xl">
            The same canvas runs jobs that are not films. Each part has its own
            page.
          </p>
        </header>

        <div className="scroll-fade grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {routes.map((r) => (
            <a
              key={r.href}
              href={r.href}
              className="group flex gap-4 rounded-2xl border border-slate-800/70 bg-slate-950/50 p-5 ring-1 ring-white/5 transition-all hover:border-slate-600 hover:bg-slate-900/60 focus-ring"
            >
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-300 group-hover:text-white">
                <r.icon className="h-5 w-5" strokeWidth={1.5} />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-base font-semibold text-white">
                  {r.name}
                  <ArrowRight className="h-4 w-4 text-slate-500 transition-transform group-hover:translate-x-1" />
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-slate-400">
                  {r.body}
                </span>
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
