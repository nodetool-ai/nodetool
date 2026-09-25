import React from "react";
import { Cloud, Cpu, Download, Globe } from "lucide-react";
import { EDITIONS } from "../data/editions";

interface EditionsCompareSectionProps {
  reducedMotion?: boolean;
  highlight?: "studio" | "cloud" | null;
}

interface EditionRow {
  label: string;
  studio: string;
  cloud: string;
}

const rows: EditionRow[] = [
  {
    label: "Where it runs",
    studio: "On macOS, Windows, or Linux",
    cloud: "In a supported browser",
  },
  {
    label: "Intended use",
    studio: "Production work",
    cloud: "Evaluation and lightweight access during alpha",
  },
  {
    label: "Local models",
    studio: "Supported runtimes can use your hardware",
    cloud: "Not available",
  },
  {
    label: "Remote providers",
    studio: "Connect your own provider accounts",
    cloud: "Connect your own provider accounts",
  },
  {
    label: "Project storage",
    studio: "Stored on your machine",
    cloud: "Hosted storage under the current alpha terms",
  },
  {
    label: "Internet requirement",
    studio: "Only for remote providers and online services",
    cloud: "Required",
  },
  {
    label: "Graphics hardware",
    studio: "Optional for hosted providers; model-dependent for local inference",
    cloud: "No local GPU required",
  },
  {
    label: "License",
    studio: "AGPL-3.0",
    cloud: "Built from the AGPL-3.0 project",
  },
];

function EditionHeader({
  kind,
  highlighted,
}: {
  kind: "studio" | "cloud";
  highlighted: boolean;
}) {
  const studio = kind === "studio";
  const Icon = studio ? Cpu : Cloud;
  return (
    <header className="border-b border-slate-800 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-200">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h3 className="font-semibold text-white">
              {studio ? EDITIONS.studio.name : EDITIONS.cloud.name}
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              {studio ? "Desktop edition" : "Browser edition · Alpha preview"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-blue-500/40 bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-200">
            {studio ? "Recommended for production" : "Alpha"}
          </span>
          {highlighted && (
            <span className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-300">
              Current page
            </span>
          )}
        </div>
      </div>
      <a
        href={studio ? "/download" : "/cloud"}
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-slate-500 hover:bg-slate-800/70 focus-ring"
      >
        {studio ? (
          <Download className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Globe className="h-4 w-4" aria-hidden="true" />
        )}
        {studio ? EDITIONS.studio.primaryAction : EDITIONS.cloud.primaryAction}
      </a>
    </header>
  );
}

function EditionRows({ kind }: { kind: "studio" | "cloud" }) {
  return (
    <dl className="divide-y divide-slate-800 px-5">
      {rows.map((row) => (
        <div
          key={`${kind}-${row.label}`}
          className="grid gap-1 py-4 sm:grid-cols-[140px_1fr] sm:gap-4"
        >
          <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {row.label}
          </dt>
          <dd className="text-sm leading-relaxed text-slate-300">
            {row[kind]}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function EditionsCompareSection({
  highlight = null,
}: EditionsCompareSectionProps) {
  return (
    <section
      id="editions"
      aria-labelledby="editions-title"
      className="relative py-24 scroll-mt-24"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <header className="mb-10 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
            Two editions, one recommendation
          </p>
          <h2
            id="editions-title"
            className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-5xl"
          >
            Studio for production. Cloud for evaluation.
          </h2>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-slate-300">
            Studio is the desktop edition and the production path. Cloud is the
            browser edition for evaluation and lightweight access while it is
            in alpha.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          <article className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70">
            <EditionHeader kind="studio" highlighted={highlight === "studio"} />
            <EditionRows kind="studio" />
          </article>
          <article className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70">
            <EditionHeader kind="cloud" highlighted={highlight === "cloud"} />
            <EditionRows kind="cloud" />
          </article>
        </div>
      </div>
    </section>
  );
}
