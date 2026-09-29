import React from "react";
import { Download, ArrowRight } from "lucide-react";
import { SmartDownloadButton } from "../app/SmartDownloadButton";
import { searchStarters, type SearchStarter as SearchStarterId } from "../data/searchStarters";
import type { LandingPage } from "../lib/analytics";
import TrackedLink from "./TrackedLink";

interface SearchStarterProps {
  starter: SearchStarterId;
  source: LandingPage;
  heading: string;
}

export default function SearchStarter({ starter, source, heading }: SearchStarterProps): React.ReactElement {
  const project = searchStarters[starter];
  return (
    <section aria-labelledby="starter-title" className="mx-auto mt-10 max-w-3xl px-6 text-left">
      <div className="rounded-2xl border border-slate-700 bg-slate-900/40 p-6">
        <h2 id="starter-title" className="text-2xl font-semibold text-white">{heading}</h2>
        <p className="mt-3 leading-relaxed text-slate-300">{project.summary}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <SmartDownloadButton
            source={source}
            starter={starter}
            placement="starter"
            icon={<Download className="h-5 w-5" aria-hidden />}
            classNameOverride="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 focus-ring"
          />
          <TrackedLink
            href={project.route}
            event="Open Starter"
            eventProps={{ starter, placement: "starter", landing_page: source }}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-500 focus-ring"
          >
            Inspect the {project.name} workflow <ArrowRight className="h-4 w-4" aria-hidden />
          </TrackedLink>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-slate-400">{project.providers}</p>
        <ol className="mt-5 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-slate-300">
          {project.steps.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </div>
    </section>
  );
}
