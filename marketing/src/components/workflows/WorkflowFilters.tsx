"use client";

import React, { useMemo, useState } from "react";
import WorkflowCard from "./WorkflowCard";
import { WORKFLOW_CATEGORIES } from "@/lib/workflows/data";
import type { WorkflowMarketplaceEntry } from "@/lib/workflows/types";

interface WorkflowFiltersProps {
  workflows: WorkflowMarketplaceEntry[];
}

export default function WorkflowFilters({ workflows }: WorkflowFiltersProps) {
  const [active, setActive] = useState<string>("all");
  const [query, setQuery] = useState<string>("");

  const categories = useMemo(() => {
    const used = new Set(workflows.map((w) => w.category));
    return [{ id: "all", label: "All" }, ...WORKFLOW_CATEGORIES.filter((c) => used.has(c.id))];
  }, [workflows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workflows.filter((w) => {
      if (active !== "all" && w.category !== active) return false;
      if (!q) return true;
      const haystack = [
        w.title,
        w.tagline,
        w.description,
        ...w.tags,
        ...w.models,
        ...w.providers,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [workflows, active, query]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActive(c.id)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium ring-1 transition-colors ${
                active === c.id
                  ? "bg-blue-500/20 text-blue-200 ring-blue-400/40"
                  : "bg-neutral-900/60 text-neutral-400 ring-white/10 hover:text-neutral-200 hover:ring-white/20"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Search models, providers, use cases…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full max-w-xs rounded-md border border-white/10 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 ring-1 ring-white/5 focus:border-blue-400/50 focus:outline-none focus:ring-blue-400/30"
          aria-label="Search workflows"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-700/60 bg-neutral-900/40 p-12 text-center text-neutral-400">
          No workflows match those filters yet. Try clearing the search or pick a different category.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((w) => (
            <WorkflowCard key={w.slug} workflow={w} />
          ))}
        </div>
      )}
    </div>
  );
}
