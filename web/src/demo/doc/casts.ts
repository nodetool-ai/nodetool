/**
 * The document casts: one per document type, plus the steering casts that
 * revisit a surface to show correction, verification, and a question asked
 * before money is spent. Kept apart from `index.ts` so a consumer (or a test)
 * can reach the cast data without pulling in the player and the editor
 * components behind it.
 */
import { heroStoryboardCast } from "../hero/heroStoryboardCast";
import { appAssistantCast } from "./appAssistantCast";
import type { DocDemoCast } from "./docCastTypes";
import { jsScriptAssistantCast } from "./jsScriptAssistantCast";
import { jsScriptRepairCast } from "./jsScriptRepairCast";
import { scriptAssistantCast } from "./scriptAssistantCast";
import { sketchAssistantCast } from "./sketchAssistantCast";
import { sketchCorrectionCast } from "./sketchCorrectionCast";
import { storyboardAskCast } from "./storyboardAskCast";
import { storyboardAssistantCast } from "./storyboardAssistantCast";

export const docCasts: DocDemoCast[] = [
  sketchAssistantCast,
  scriptAssistantCast,
  storyboardAssistantCast,
  jsScriptAssistantCast,
  appAssistantCast,
  // Steering casts: the same surfaces, showing correction, a question asked
  // before spending, and a check that fails before it passes.
  sketchCorrectionCast,
  storyboardAskCast,
  jsScriptRepairCast,
  // The landing-page hero: the same board rendering stills and then clips.
  heroStoryboardCast
];
