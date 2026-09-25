import React from "react";

interface SecondaryAction {
  href: string;
  label: string;
  external?: boolean;
}

interface MarketingHeroProps {
  eyebrow: string;
  title: string;
  body: string;
  primaryAction: React.ReactNode;
  secondaryAction: SecondaryAction;
  trustLine: string;
  recommendation?: string;
  media: React.ReactNode;
  headingId: string;
}

export default function MarketingHero({
  eyebrow,
  title,
  body,
  primaryAction,
  secondaryAction,
  trustLine,
  recommendation,
  media,
  headingId,
}: MarketingHeroProps) {
  return (
    <section aria-labelledby={headingId} className="pb-16 pt-8 md:pb-24 md:pt-12">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <header className="max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
            {eyebrow}
          </p>
          <h1
            id={headingId}
            className="mt-4 text-balance text-4xl font-semibold leading-tight tracking-tight text-slate-50 sm:text-5xl lg:text-6xl"
          >
            {title}
          </h1>
        </header>

        <div className="mt-8 grid items-start gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5">
            <p className="max-w-xl text-lg leading-relaxed text-slate-300">
              {body}
            </p>
            <div className="mt-7 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              {primaryAction}
              <a
                href={secondaryAction.href}
                {...(secondaryAction.external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/60 px-6 py-3 text-sm font-semibold text-slate-100 transition-colors hover:border-slate-500 hover:bg-slate-800/70 focus-ring"
              >
                {secondaryAction.label}
              </a>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              {trustLine}
            </p>
            {recommendation && (
              <p className="mt-3 border-l-2 border-blue-500 pl-4 text-sm font-medium text-slate-200">
                {recommendation}
              </p>
            )}
          </div>
          <div className="lg:col-span-7">{media}</div>
        </div>
      </div>
    </section>
  );
}
