/**
 * Every `/showcase/*` route as a flat `PageEntry[]`, for the registry (→ sitemap
 * + smoke suite). Order matters: the hub and the static filter pages come first
 * so a `sample` cap in the registry always covers them before the long tail of
 * detail pages.
 *
 *   /showcase                     hub
 *   /showcase/model/<slug>        one per distinct model  (static filter page)
 *   /showcase/workflow/<slug>     one per distinct workflow (static filter page)
 *   /showcase/<workflow>/<id>     one per generation (detail page)
 */
import type { PageEntry } from "./types";
import {
  showcaseEntries,
  showcaseModels,
  showcaseWorkflows,
  humanize,
} from "./showcase";

const hub: PageEntry = {
  route: "/showcase",
  title: "Showcase — AI images & video made with NodeTool",
  description:
    "A gallery of images and video generated with NodeTool workflows, browsable by model and by workflow.",
  priority: 0.7,
  changeFrequency: "weekly",
  indexable: true,
};

const modelFilters: PageEntry[] = showcaseModels().map((m) => ({
  route: `/showcase/model/${m.slug}`,
  title: `${m.label} showcase — AI generations on NodeTool`,
  description: `Every showcase generation made with ${m.label} on NodeTool.`,
  priority: 0.6,
  changeFrequency: "weekly",
  indexable: true,
}));

const workflowFilters: PageEntry[] = showcaseWorkflows().map((w) => ({
  route: `/showcase/workflow/${w.slug}`,
  title: `${humanize(w.slug)} showcase — AI generations on NodeTool`,
  description: `Every showcase generation from the ${humanize(
    w.slug
  )} workflow on NodeTool.`,
  priority: 0.6,
  changeFrequency: "weekly",
  indexable: true,
}));

export const showcasePageEntries: PageEntry[] = [
  hub,
  ...modelFilters,
  ...workflowFilters,
  ...showcaseEntries,
];
