"use client";
import { useState } from "react";
import { Search } from "lucide-react";

/**
 * Filters the server-rendered model list in place by each `[data-model]`
 * row's text, so the client gets no second copy of the data.
 */
/** "Veo 3.1" finds `veo3.1` and `veo-3.1`. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s_/-]+/g, "");
}

export default function ModelDirectoryFilter({ targetId }: { targetId: string }) {
  const [shown, setShown] = useState<number | null>(null);

  function filter(query: string) {
    const root = document.getElementById(targetId);
    if (!root) return;
    const q = normalize(query);
    let total = 0;
    root.querySelectorAll<HTMLElement>("[data-model-provider]").forEach((group) => {
      let matches = 0;
      group.querySelectorAll<HTMLElement>("[data-model]").forEach((row) => {
        const hit = !q || normalize(row.textContent ?? "").includes(q);
        row.hidden = !hit;
        if (hit) matches++;
      });
      group.hidden = matches === 0;
      if (group instanceof HTMLDetailsElement) group.open = q.length > 0 && matches > 0;
      total += matches;
    });
    root.querySelectorAll<HTMLElement>("[data-model-kind]").forEach((section) => {
      const visible = section.querySelector("[data-model-provider]:not([hidden])");
      section.hidden = q.length > 0 && !visible;
    });
    setShown(q ? total : null);
  }

  return (
    <div className="mt-6 max-w-xl">
      <label className="relative block">
        <span className="sr-only">Search models</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type="search"
          placeholder="Search models, like flux or veo 3"
          onChange={(e) => filter(e.target.value)}
          className="w-full rounded-xl border border-slate-800/70 bg-slate-900/60 py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus-ring"
        />
      </label>
      <p aria-live="polite" className="mt-2 h-5 text-sm text-slate-500">
        {shown === null ? "" : `${shown.toLocaleString()} matching model${shown === 1 ? "" : "s"}`}
      </p>
    </div>
  );
}
