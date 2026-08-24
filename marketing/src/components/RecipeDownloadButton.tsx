"use client";

import React from "react";
import { Download } from "lucide-react";
import { track } from "@/lib/analytics";

interface RecipeDownloadButtonProps {
  /** Public path to the `.nodetool` bundle. */
  href: string;
  /** Recipe slug, sent as the event property. */
  slug: string;
  workflowCount: number;
}

/**
 * Downloads a recipe's bundle and reports the click.
 *
 * `download` is a same-origin hint, so the browser saves the file instead of
 * navigating to a zip it cannot render. The event fires before the default
 * action rather than in place of it — `track` swallows its own failures, so a
 * blocked analytics script never costs the visitor the download.
 */
export default function RecipeDownloadButton({
  href,
  slug,
  workflowCount,
}: RecipeDownloadButtonProps) {
  return (
    <a
      href={href}
      download
      onClick={() => track("Download Recipe", { slug })}
      className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-500 px-8 py-3.5 text-sm font-semibold text-slate-950 shadow-[0_10px_30px_-10px_rgba(245,158,11,0.6)] transition-all hover:bg-amber-400"
    >
      <Download className="h-5 w-5" />
      Download all {workflowCount} workflows
    </a>
  );
}
