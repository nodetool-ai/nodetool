"use client";

import React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowRight, Clock, Layers } from "lucide-react";
import type { WorkflowMarketplaceEntry } from "@/lib/workflows/types";

const WorkflowPreviewFlow = dynamic(() => import("./WorkflowPreviewFlow"), { ssr: false });

interface WorkflowCardProps {
  workflow: WorkflowMarketplaceEntry;
}

export default function WorkflowCard({ workflow }: WorkflowCardProps) {
  return (
    <Link
      href={`/workflows/${workflow.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-900/60 ring-1 ring-white/5 transition-all hover:border-blue-500/50 hover:ring-blue-400/20 hover:-translate-y-0.5"
      aria-label={`Open the ${workflow.title} workflow`}
    >
      <div className="relative h-56 w-full border-b border-slate-800/70 bg-gradient-to-br from-slate-950 to-slate-900">
        <WorkflowPreviewFlow
          nodes={workflow.preview.nodes}
          edges={workflow.preview.edges}
          interactive={false}
          scaleX={200}
          scaleY={120}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />
        <div className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-slate-300 ring-1 ring-white/10 backdrop-blur">
          {workflow.category}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <h3 className="text-lg font-semibold text-white group-hover:text-blue-300 transition-colors">
          {workflow.title}
        </h3>
        <p className="text-sm text-slate-400 leading-relaxed line-clamp-3">{workflow.tagline}</p>

        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> {workflow.runtime}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" /> {workflow.difficulty}
          </span>
          <span className="ml-auto inline-flex items-center gap-1 text-blue-300 opacity-0 transition-opacity group-hover:opacity-100">
            View <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}
