import React from "react";
import TrackedLink from "../TrackedLink";
import type { TrackEvent } from "../../lib/analytics";

export const container = "mx-auto max-w-6xl px-6 lg:px-8";
export const eyebrowClass =
  "font-jetbrains text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300";
export const h2Class =
  "mt-3 text-2xl font-semibold tracking-tight text-white md:text-4xl";
export const leadClass = "mt-4 text-base leading-relaxed text-slate-300 md:text-lg";
export const inlineCode =
  "rounded bg-slate-800/80 px-1.5 py-0.5 font-jetbrains text-[0.9em] text-slate-100";

export interface LibraryLink {
  label: string;
  href: string;
  event: TrackEvent;
}

interface LibraryHeroProps {
  id: string;
  packageName: string;
  title: string;
  lead: React.ReactNode;
  links: LibraryLink[];
  facts: string[];
  children: React.ReactNode;
}

/** Hero for a library page: package name, claim, install line, and a code sample. */
export function LibraryHero({
  id,
  packageName,
  title,
  lead,
  links,
  facts,
  children,
}: LibraryHeroProps) {
  return (
    <section aria-labelledby={id} className="pb-14 pt-8 md:pb-20 md:pt-12">
      <div className={container}>
        <div className="grid items-start gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="min-w-0 lg:col-span-5">
            <p className={eyebrowClass}>Open-source library · MIT</p>
            <p className="mt-4 font-jetbrains text-sm text-slate-400">
              {packageName}
            </p>
            <h1
              id={id}
              className="mt-2 text-balance text-4xl font-semibold leading-tight tracking-tight text-slate-50 sm:text-5xl"
            >
              {title}
            </h1>
            <div className="mt-6 text-lg leading-relaxed text-slate-300">
              {lead}
            </div>
            <pre className="mt-8 overflow-x-auto rounded-xl border border-slate-700/70 bg-slate-950 px-4 py-3 font-jetbrains text-sm text-slate-100">
              <span className="select-none text-slate-500">$ </span>
              npm install {packageName}
            </pre>
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {links.map((link) => (
                <li key={link.href}>
                  <TrackedLink
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    event={link.event}
                    eventProps={{ placement: "library-hero", package: packageName }}
                    className="font-medium text-emerald-300 underline-offset-4 hover:underline focus-ring"
                  >
                    {link.label} ↗
                  </TrackedLink>
                </li>
              ))}
            </ul>
            <ul
              aria-label="Package facts"
              className="mt-6 flex flex-wrap gap-2"
            >
              {facts.map((fact) => (
                <li
                  key={fact}
                  className="rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 font-jetbrains text-xs text-slate-300"
                >
                  {fact}
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0 lg:col-span-7">{children}</div>
        </div>
      </div>
    </section>
  );
}

interface LibrarySectionProps {
  id: string;
  eyebrow: string;
  title: string;
  lead?: React.ReactNode;
  children: React.ReactNode;
}

export function LibrarySection({
  id,
  eyebrow,
  title,
  lead,
  children,
}: LibrarySectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="rhythm-section">
      <div className={container}>
        <header className="mb-8 max-w-3xl">
          <p className={eyebrowClass}>{eyebrow}</p>
          <h2 id={`${id}-title`} className={h2Class}>
            {title}
          </h2>
          {lead ? <div className={leadClass}>{lead}</div> : null}
        </header>
        {children}
      </div>
    </section>
  );
}

/** A plain monospace figure, for wire diagrams and file trees. */
export function MonoFigure({
  label,
  caption,
  children,
}: {
  label: string;
  caption: string;
  children: string;
}) {
  return (
    <figure className="min-w-0">
      <pre
        aria-label={label}
        className="overflow-x-auto rounded-2xl border border-slate-700/70 bg-slate-950 p-5 font-jetbrains text-xs leading-relaxed text-slate-200 md:text-sm"
      >
        {children}
      </pre>
      <figcaption className="mt-3 text-sm leading-relaxed text-slate-400">
        {caption}
      </figcaption>
    </figure>
  );
}

export interface LibraryQuestion {
  question: string;
  answer: React.ReactNode;
}

export function LibraryQuestions({ items }: { items: LibraryQuestion[] }) {
  return (
    <dl className="divide-y divide-slate-800 border-y border-slate-800">
      {items.map((item) => (
        <div
          key={item.question}
          className="grid gap-2 py-6 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:gap-10"
        >
          <dt className="font-semibold text-white">{item.question}</dt>
          <dd className="text-sm leading-relaxed text-slate-300 md:text-base">
            {item.answer}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Closing line: where the code lives and how it is used inside NodeTool. */
export function LibraryFooterNote({
  sourceHref,
  packageName,
  children,
}: {
  sourceHref: string;
  packageName: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label="Source and context" className="rhythm-section">
      <div className={`${container} max-w-3xl`}>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 md:p-8">
          <div className="text-sm leading-relaxed text-slate-300 md:text-base">
            {children}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <TrackedLink
              href={sourceHref}
              target="_blank"
              rel="noopener noreferrer"
              event="Star GitHub"
              eventProps={{ placement: "library-closing", package: packageName }}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 focus-ring"
            >
              Read the source
            </TrackedLink>
            <TrackedLink
              href="https://github.com/nodetool-ai/nodetool/issues"
              target="_blank"
              rel="noopener noreferrer"
              event="Star GitHub"
              eventProps={{ placement: "library-issues", package: packageName }}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-100 transition-colors hover:border-slate-500 focus-ring"
            >
              File an issue
            </TrackedLink>
          </div>
        </div>
      </div>
    </section>
  );
}
