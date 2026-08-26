/**
 * Document demo harness — the five document surfaces the graph, chat, and
 * timeline players don't cover, each replayed beside the assistant that drove
 * the edits. See `docCastTypes.ts` for the format.
 */
export * from "./docCastTypes";
export {
  docStateAt,
  disposeDocState,
  foldDocAt,
  seedDocState
} from "./docReplay";
export { DocDemoPlayer } from "./DocDemoPlayer";
export type { DocDemoPlayerProps } from "./DocDemoPlayer";
export { sketchAssistantCast } from "./sketchAssistantCast";
export { scriptAssistantCast } from "./scriptAssistantCast";
export { storyboardAssistantCast } from "./storyboardAssistantCast";
export { jsScriptAssistantCast } from "./jsScriptAssistantCast";
export { appAssistantCast } from "./appAssistantCast";
export { sketchCorrectionCast } from "./sketchCorrectionCast";
export { storyboardAskCast } from "./storyboardAskCast";
export { jsScriptRepairCast } from "./jsScriptRepairCast";
export { docCasts } from "./casts";
