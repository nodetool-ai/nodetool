"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import { getSearchStarter, searchStarters } from "../data/searchStarters";
import TrackedLink from "./TrackedLink";

export default function DownloadStarter(): React.ReactElement | null {
  const params = useSearchParams();
  const starter = getSearchStarter(params.get("starter"));
  if (!starter) {
    return null;
  }
  const project = searchStarters[starter];
  return (
    <section aria-labelledby="download-starter-title" className="mt-8 rounded-2xl border border-slate-700 bg-slate-900/40 p-6">
      <h2 id="download-starter-title" className="text-xl font-semibold text-white">After installing: {project.name}</h2>
      <p className="mt-3 text-sm leading-relaxed text-slate-300">{project.providers}</p>
      <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-slate-300">
        {project.steps.map((step) => <li key={step}>{step}</li>)}
      </ol>
      <TrackedLink
        href={project.route}
        event="Open Starter"
        eventProps={{ starter, placement: "download" }}
        className="mt-5 inline-flex text-sm font-medium text-blue-300 underline underline-offset-2 hover:text-blue-200 focus-ring"
      >
        Inspect the {project.name} workflow
      </TrackedLink>
    </section>
  );
}
