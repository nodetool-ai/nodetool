/**
 * clipStatusReducer
 *
 * Pure function that derives a clip's visible status badge from the
 * current sources of truth.  This is the canonical implementation of the
 * status-mapping table from PRD §5.5.
 *
 * All inputs are plain values — no Zustand, no React — so the function is
 * trivially unit-testable.
 */

import type { ClipStatus, TimelineClip } from "@nodetool-ai/timeline";

// ── Input shapes ───────────────────────────────────────────────────────────

/**
 * Clip-level error state synthesised from ErrorStore node entries for the
 * clip's bound workflow.
 *
 * A clip has a relevant error when at least one node in its workflow's
 * ErrorStore entry has a non-empty error.  Callers should aggregate node
 * errors and pass the result here.
 */
export interface ClipErrorState {
  hasError: boolean;
  /** Human-readable message: "Failed at <nodeName>: <error>" */
  message?: string;
}

// ── Status mapping (PRD §5.5) ──────────────────────────────────────────────
//
// | Condition                                             | Status        |
// |-------------------------------------------------------|---------------|
// | clip.locked                                           | "locked"      |
// | clip.status == "queued"                               | "queued"      |
// | clip.status == "generating"                           | "generating"  |
// | clip.status == "failed"                               | "failed"      |
// | errorState has clip-relevant error                    | "failed"      |
// | clip.currentAssetId set, asset missing in AssetStore  | "missing"     |
// | sourceType == "generated" && !currentAssetId          | "draft"       |
// | dependencyHash != lastGeneratedHash                   | "stale"       |
// | default                                               | "generated"   |

/**
 * Derive the visible clip status badge.
 *
 * `clip.status` is the single source of truth for generation lifecycle. Both
 * generation paths write it: the workflow path mirrors its
 * TimelineGenerationStore job into it, and the direct-gen path (text-to-image /
 * image-to-image / text-to-video / text-to-audio) writes it straight. So a
 * clip that is queued, generating, or failed reads identically here regardless
 * of which path produced it.
 *
 * @param clip        Relevant clip fields from TimelineStore.
 * @param errorState  Aggregated error state for the clip's workflow nodes, or
 *                    `null` when there are no errors.
 * @param assetExists Whether `clip.currentAssetId` resolves to a known asset.
 *                    Pass `true` when `currentAssetId` is unset.
 * @returns The derived ClipStatus.
 */
export function deriveClipStatus(
  clip: Pick<
    TimelineClip,
    | "locked"
    | "status"
    | "currentAssetId"
    | "sourceType"
    | "dependencyHash"
    | "lastGeneratedHash"
  >,
  errorState: ClipErrorState | null,
  assetExists: boolean
): ClipStatus {
  // 1. Locked clips always show the lock badge.
  if (clip.locked) {
    return "locked";
  }

  // 2. In-flight / failed lifecycle, straight off the single source of truth.
  if (clip.status === "queued") {
    return "queued";
  }
  if (clip.status === "generating") {
    return "generating";
  }
  if (clip.status === "failed") {
    return "failed";
  }

  // 3. Node-level error in the bound workflow → treat as failed.
  if (errorState?.hasError) {
    return "failed";
  }

  // 4. Asset was assigned but has since been deleted.
  if (clip.currentAssetId && !assetExists) {
    return "missing";
  }

  // 5. Generated clip with no output yet.
  if (clip.sourceType === "generated" && !clip.currentAssetId) {
    return "draft";
  }

  // 6. Param or dependency change since last successful generation.
  if (
    clip.dependencyHash !== undefined &&
    clip.lastGeneratedHash !== undefined &&
    clip.dependencyHash !== clip.lastGeneratedHash
  ) {
    return "stale";
  }

  // 7. Default: clip has been successfully generated and is up to date.
  return "generated";
}
