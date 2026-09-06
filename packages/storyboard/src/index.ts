/**
 * @nodetool-ai/storyboard — storyboard derivations.
 *
 * Recasting a board onto a new cast and planning its shot renders are
 * storyboard-only, need protocol's prompt composition and timeline's linked
 * shot timing, and are called from three places: the `nodetool.storyboard.*`
 * nodes, the agent capabilities, and the board editor. Hence a package of their
 * own (design §3.1). `recast.ts` and `render-plan.ts` are pure; `io/` holds the
 * one render path that spends money.
 */

export type { StoryboardDocument } from "./document.js";
export { recastStoryboard, recastKeyFor } from "./recast.js";
export type {
  RecastCastEntry,
  RecastInput,
  RecastResult
} from "./recast.js";
export { boardRenderContext, planShotRenders } from "./render-plan.js";
export type {
  ShotRenderPlan,
  ShotRenderPlanOptions,
  WireEntity
} from "./render-plan.js";
export { renderShots } from "./io/render-shots.js";
export type {
  RenderGenerationRequest,
  RenderGenerationResult,
  RenderShotsOptions,
  ShotRenderOutcome,
  StoryboardRenderHost,
  StoryboardSnapshot
} from "./io/render-shots.js";
