/**
 * Render record and staleness.
 *
 * A still or a clip is stale when the shot it belongs to would render
 * differently today — the style changed, the model changed, the action was
 * rewritten. The board marks those versions so a creator can see what is out of
 * date without the app spending anything to find out (PRD § 7.7.4, D12: a style
 * change never renders).
 *
 * Staleness is derived, never persisted as a flag. What is persisted is the
 * {@link RenderInputs} record written when the job was enqueued and stored on
 * the version when the asset landed, so a render that finishes after a style
 * change carries its enqueue-time inputs and reads stale on arrival. A version
 * with no record — legacy, an upload, a flip, an image-editor edit — is never
 * stale, because there is nothing to compare it against.
 *
 * Pure, and shared: the board's stale pill, the toolbar's stale count and the
 * `staleOnly` render tools all ask the same question here.
 */

import type {
  ClipVersion,
  KeyframeVersion,
  RenderInputs,
  Scene,
  Shot
} from "./creative.js";
import { shotRenderMode } from "./creative.js";
import { sha256Hex } from "./sha256.js";
import {
  clipPrompt,
  directClipPrompt,
  keyframePrompt,
  sceneForShot
} from "./shot-prompt.js";

/**
 * The board settings a shot's render inputs are drawn from.
 *
 * Structural, not the web store's board type: protocol cannot import from
 * `web/`, and the headless capabilities hold the same values in a different
 * shape. Each caller passes what it has.
 */
export interface BoardRenderContext {
  aspect_ratio: string;
  /** Model id every still on this board renders with. */
  image_model: string;
  /** Model id every clip on this board renders with. */
  video_model: string;
  /** The board's one style entity, or null when no preset is applied. */
  style_entity_id: string | null;
  /** The style descriptor pasted into still and direct-clip prompts. */
  style: string;
  /** The screenplay's scenes, so a shot's lighting can be found. */
  scenes?: readonly Scene[] | null;
}

/** A {@link RenderInputs} before it is stamped — what the comparison reads. */
export type RenderInputsDraft = Omit<RenderInputs, "recorded_at">;

/**
 * A version's identity for `source_version_id`.
 *
 * `asset_id` is the stored identifier; `uri` covers a version that has not been
 * absorbed into the asset library yet. An empty string means the ref names
 * nothing, and no clip can have animated it.
 */
export function versionId(
  version: KeyframeVersion | ClipVersion | null | undefined
): string {
  return version?.asset_id ?? version?.uri ?? "";
}

/**
 * The prompt a shot would compose now for one kind, hashed.
 *
 * Hashing rather than storing the prompt keeps the record small on a document
 * that carries one per version, and the record is only ever compared, never
 * read back as text.
 */
function promptHashFor(
  shot: Shot,
  board: BoardRenderContext,
  kind: RenderInputs["kind"]
): string {
  const scene = sceneForShot(shot, board.scenes);
  const context = { scene, style: board.style };
  if (kind === "keyframe") {
    return sha256Hex(keyframePrompt(shot, context));
  }
  return sha256Hex(
    shotRenderMode(shot) === "direct"
      ? directClipPrompt(shot, context)
      : clipPrompt(shot)
  );
}

/**
 * The inputs `shot` would render with right now.
 *
 * Unstamped: `recorded_at` is a fact about a job, not an input, so it is added
 * by {@link stampRenderInputs} at enqueue time and ignored by every comparison.
 */
export function currentRenderInputs(
  shot: Shot,
  board: BoardRenderContext,
  kind: RenderInputs["kind"]
): RenderInputsDraft {
  const draft: RenderInputsDraft = {
    kind,
    prompt_hash: promptHashFor(shot, board, kind),
    model: kind === "keyframe" ? board.image_model : board.video_model,
    aspect_ratio: board.aspect_ratio,
    style_entity_id: board.style_entity_id
  };
  // A keyframe-mode clip animates the selected still, so which still that was
  // is one of its inputs: re-picking a take makes the clip stale. A direct clip
  // has no source.
  if (kind === "clip" && shotRenderMode(shot) === "keyframe") {
    draft.source_version_id = versionId(shot.keyframe);
  }
  return draft;
}

/** Stamp a draft for storage on the version once its asset lands. */
export function stampRenderInputs(
  draft: RenderInputsDraft,
  recordedAt: string = new Date().toISOString()
): RenderInputs {
  return { ...draft, recorded_at: recordedAt };
}

/**
 * Whether `version` was rendered from inputs the shot no longer has.
 *
 * A version with no record is never stale: an upload, a flip or an
 * image-editor edit was never a render, so there is nothing it could be out of
 * date with respect to.
 */
export function isVersionStale(
  version: KeyframeVersion | ClipVersion | null | undefined,
  shot: Shot,
  board: BoardRenderContext
): boolean {
  const recorded = version?.render_inputs;
  if (!recorded) {
    return false;
  }
  return !renderInputsMatchDraft(
    recorded,
    currentRenderInputs(shot, board, recorded.kind)
  );
}

/** Field-by-field equality of a stored record against a fresh draft. */
function renderInputsMatchDraft(
  recorded: RenderInputs,
  current: RenderInputsDraft
): boolean {
  return (
    recorded.kind === current.kind &&
    recorded.prompt_hash === current.prompt_hash &&
    recorded.model === current.model &&
    recorded.aspect_ratio === current.aspect_ratio &&
    recorded.style_entity_id === current.style_entity_id &&
    recorded.source_version_id === current.source_version_id
  );
}

/** Whether a shot's selected still and selected clip are stale. */
export interface ShotStaleness {
  keyframe: boolean;
  clip: boolean;
}

/**
 * Staleness of the two versions a shot actually shows.
 *
 * The board's pill and the toolbar's count read the selection, not every take:
 * an old take the creator did not pick is not something to re-render.
 */
export function shotStaleness(
  shot: Shot,
  board: BoardRenderContext
): ShotStaleness {
  return {
    keyframe: isVersionStale(shot.keyframe, shot, board),
    clip: isVersionStale(shot.clip, shot, board)
  };
}

/** The shots whose selected still is stale — what `Re-render stills` enqueues. */
export function staleKeyframeShots(
  shots: readonly Shot[],
  board: BoardRenderContext
): Shot[] {
  return shots.filter((shot) => isVersionStale(shot.keyframe, shot, board));
}

/** The shots whose selected clip is stale. */
export function staleClipShots(
  shots: readonly Shot[],
  board: BoardRenderContext
): Shot[] {
  return shots.filter((shot) => isVersionStale(shot.clip, shot, board));
}
