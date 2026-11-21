/**
 * Every Simplified Chinese page, keyed by the English route it translates.
 * The keys must match TRANSLATED_ROUTES.zh in i18n/routes.ts.
 */
import type { LocalizedPageContent } from "@/i18n/content";
import { studio } from "./pages/studio";
import { agents } from "./pages/agents";
import { nodeBasedWorkflows } from "./pages/nodeBasedWorkflows";
import { aiVideoEditor } from "./pages/aiVideoEditor";
import { storyboards } from "./pages/storyboards";
import { mcp } from "./pages/mcp";
import { models } from "./pages/models";
import { download } from "./pages/download";
import { pricing } from "./pages/pricing";
import { marketing } from "./pages/marketing";
import { recipes } from "./pages/recipes";
import { adLibrary } from "./pages/adLibrary";
import { comfyui } from "./pages/comfyui";

export const ZH_PAGES: Record<string, LocalizedPageContent> = Object.fromEntries(
  [studio, agents, nodeBasedWorkflows, aiVideoEditor, storyboards, mcp, models, download, pricing, marketing, recipes, adLibrary, comfyui].map(
    (page) => [page.route, page]
  )
);
