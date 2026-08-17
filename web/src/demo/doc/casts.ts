/**
 * The document casts, one per document type. Kept apart from `index.ts` so a
 * consumer (or a test) can reach the cast data without pulling in the player
 * and the editor components behind it.
 */
import { appAssistantCast } from "./appAssistantCast";
import type { DocDemoCast } from "./docCastTypes";
import { jsScriptAssistantCast } from "./jsScriptAssistantCast";
import { scriptAssistantCast } from "./scriptAssistantCast";
import { sketchAssistantCast } from "./sketchAssistantCast";
import { storyboardAssistantCast } from "./storyboardAssistantCast";

export const docCasts: DocDemoCast[] = [
  sketchAssistantCast,
  scriptAssistantCast,
  storyboardAssistantCast,
  jsScriptAssistantCast,
  appAssistantCast
];
