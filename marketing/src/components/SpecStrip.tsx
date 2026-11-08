import React from "react";

/*
 * The shared differentiators, one line each. These facts are explained in
 * full on exactly one page (the `href`), and every other page states them
 * here instead of in a section of its own (site-editorial.spec.md § Once per
 * site). Keep each `value` to one line with no marketing prose.
 *
 * Sources: the plan line follows SubscriptionSection (Studio only, Claude
 * plans run chat and the agent only). The cost line follows NARRATIVE.md
 * § Cost, once.
 */
export const SPEC_ITEMS = {
  editors: {
    term: "Editors",
    value: "Script, storyboard, sketch, timeline, 3D, game, and node graph",
    href: "/studio",
  },
  plan: {
    term: "Agent",
    value: "Runs on your ChatGPT, Claude, or Gemini plan in Studio",
    href: "/pricing#subscription",
  },
  models: {
    term: "Models",
    value: "Hosted models on your own keys, local models through Ollama and MLX",
    href: "/models",
  },
  cost: {
    term: "Cost",
    value: "Provider list price. NodeTool adds nothing on your keys",
    href: "/pricing",
  },
  source: {
    term: "Source",
    value: "Open source, AGPL-3.0. Projects are files on your disk",
    href: "https://github.com/nodetool-ai/nodetool",
  },
  access: {
    term: "Runs on",
    value: "macOS, Windows, Linux. MCP, CLI, and HTTP API",
    href: "/developers",
  },
} as const;

export type SpecItemKey = keyof typeof SPEC_ITEMS;

const DEFAULT_ITEMS: SpecItemKey[] = [
  "editors",
  "plan",
  "models",
  "cost",
  "source",
  "access",
];

interface SpecStripProps {
  items?: SpecItemKey[];
  /** Visible label; the section is named by it. */
  heading?: string;
  id?: string;
  className?: string;
}

export default function SpecStrip({
  items = DEFAULT_ITEMS,
  heading = "Specs",
  id = "specs",
  className = "",
}: SpecStripProps) {
  const titleId = `${id}-title`;
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={`relative scroll-mt-28 ${className}`}
    >
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <h2
          id={titleId}
          className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400"
        >
          {heading}
        </h2>
        <dl className="mt-4 grid border-t border-slate-800 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((key) => {
            const item = SPEC_ITEMS[key];
            const external = item.href.startsWith("http");
            return (
              <div key={key} className="border-b border-slate-800 py-4 sm:pr-6">
                <dt className="font-jetbrains text-xs uppercase tracking-[0.14em] text-slate-400">
                  {item.term}
                </dt>
                <dd className="mt-1 text-sm leading-relaxed text-slate-200">
                  <a
                    href={item.href}
                    {...(external
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                    className="underline decoration-slate-600 underline-offset-4 transition-colors hover:text-white hover:decoration-slate-300 focus-ring"
                  >
                    {item.value}
                  </a>
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
    </section>
  );
}
