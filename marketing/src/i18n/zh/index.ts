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
import { demo } from "./pages/demo";
import { cloud } from "./pages/cloud";
import { nodeBasedAi } from "./pages/nodeBasedAi";
import { aiImageEditor } from "./pages/aiImageEditor";
import { gamedev } from "./pages/gamedev";
import { aiGameEngines } from "./pages/aiGameEngines";
import { figmaWeave } from "./pages/figmaWeave";
import { lmStudio } from "./pages/lmStudio";
import { flora } from "./pages/flora";
import { moviePoster } from "./pages/moviePoster";

export const ZH_PAGES: Record<string, LocalizedPageContent> = Object.fromEntries(
  [studio, agents, nodeBasedWorkflows, aiVideoEditor, storyboards, mcp, models, download, pricing, marketing, recipes, adLibrary, comfyui, demo, cloud, nodeBasedAi, aiImageEditor, gamedev, aiGameEngines, figmaWeave, lmStudio, flora, moviePoster].map(
    (page) => [page.route, page]
  )
);
