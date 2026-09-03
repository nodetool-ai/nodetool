/**
 * Normalizing a hand-authored timeline document.
 *
 * An agent writing a cut from scratch sends the fields it cares about —
 * tracks, clips, the words on screen — and leaves out the bookkeeping the
 * document schema requires (`index`, `visible`, `locked`, `sourceType`,
 * `status`, `versions`, animation ids, `markers`). Refusing that document with
 * two dozen schema errors teaches the caller nothing it could not have been
 * given, so the missing fields are filled here before validation.
 *
 * Only absent fields are filled. A value the caller sent is never replaced —
 * the point of a whole-document write is that what was sent is what is stored.
 */

import type { TimelineClip } from "./types.js";

/** Render settings that belong on the sequence row, not in the document. */
export interface AuthoredRenderSettings {
  fps?: number;
  width?: number;
  height?: number;
}

export interface NormalizedAuthoredDocument {
  /** The document with the schema's required fields filled in. */
  document: Record<string, unknown>;
  /**
   * `fps`/`width`/`height` found at the top level of the document. They are
   * sequence settings rather than document fields, so a schema round trip
   * strips them; lifted here they configure the sequence instead of being
   * silently dropped with a `field_stripped` warning.
   */
  settings: AuthoredRenderSettings;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

/**
 * Whether a clip describes media it will produce or media it already has.
 *
 * A clip naming a prompt, a workflow, or a generation binding is a clip the
 * renderer will generate; everything else — a placed asset, a title, a shape,
 * a group — is authored or imported. Matches what the `ui_timeline_*` bridge
 * stamps when it creates each kind of clip.
 */
export function sourceTypeForClip(
  clip: Pick<
    Partial<TimelineClip>,
    "prompt" | "workflowId" | "bindingKind" | "provider" | "model"
  >
): TimelineClip["sourceType"] {
  const generated =
    (typeof clip.prompt === "string" && clip.prompt.trim() !== "") ||
    typeof clip.workflowId === "string" ||
    typeof clip.bindingKind === "string" ||
    (typeof clip.provider === "string" && typeof clip.model === "string");
  return generated ? "generated" : "imported";
}

function normalizeTrack(
  track: Record<string, unknown>,
  index: number
): Record<string, unknown> {
  const next = { ...track };
  if (next["index"] === undefined) next["index"] = index;
  if (next["visible"] === undefined) next["visible"] = true;
  if (next["locked"] === undefined) next["locked"] = false;
  return next;
}

function normalizeClip(
  clip: Record<string, unknown>,
  nextAnimationId: () => string
): Record<string, unknown> {
  const next = { ...clip };
  if (next["sourceType"] === undefined) {
    next["sourceType"] = sourceTypeForClip(next as Partial<TimelineClip>);
  }
  // "generated" is the ready state for a clip that already has its media —
  // the schema has no "ready", and it is what the bridge stamps on the text,
  // shape and asset clips it creates.
  if (next["status"] === undefined) next["status"] = "generated";
  if (next["locked"] === undefined) next["locked"] = false;
  if (next["versions"] === undefined) next["versions"] = [];
  const animations = next["animations"];
  if (Array.isArray(animations)) {
    next["animations"] = animations.map((animation) => {
      if (!isRecord(animation) || animation["id"] !== undefined) {
        return animation;
      }
      return { ...animation, id: nextAnimationId() };
    });
  }
  return next;
}

/** Collect the animation ids already in use, so a filled one cannot collide. */
function usedAnimationIds(clips: unknown[]): Set<string> {
  const used = new Set<string>();
  for (const clip of clips) {
    if (!isRecord(clip)) continue;
    const animations = clip["animations"];
    if (!Array.isArray(animations)) continue;
    for (const animation of animations) {
      if (isRecord(animation) && typeof animation["id"] === "string") {
        used.add(animation["id"]);
      }
    }
  }
  return used;
}

/**
 * Fill the required fields a hand-authored document leaves out and lift its
 * render settings. See {@link NormalizedAuthoredDocument}.
 */
export function normalizeAuthoredDocument(
  raw: Record<string, unknown>
): NormalizedAuthoredDocument {
  const document: Record<string, unknown> = { ...raw };

  const settings: AuthoredRenderSettings = {};
  for (const key of ["fps", "width", "height"] as const) {
    const lifted = positiveNumber(document[key]);
    if (lifted !== undefined) settings[key] = lifted;
    if (document[key] !== undefined) delete document[key];
  }

  if (Array.isArray(document["tracks"])) {
    document["tracks"] = document["tracks"].map((track, index) =>
      isRecord(track) ? normalizeTrack(track, index) : track
    );
  }

  if (Array.isArray(document["clips"])) {
    const clips = document["clips"];
    const used = usedAnimationIds(clips);
    let counter = 0;
    const nextAnimationId = (): string => {
      let id = `anim_${++counter}`;
      while (used.has(id)) id = `anim_${++counter}`;
      used.add(id);
      return id;
    };
    document["clips"] = clips.map((clip) =>
      isRecord(clip) ? normalizeClip(clip, nextAnimationId) : clip
    );
  }

  if (document["markers"] === undefined) document["markers"] = [];

  return { document, settings };
}
