/**
 * The document an op reads and writes, and everything an op needs that a pure
 * function cannot know.
 *
 * Three hosts drive the same `ui_timeline_*` surface — the headless eval
 * bridge, the browser store, the mobile document — and each used to carry its
 * own copy of the op semantics. They diverged: `set_clip_params` silently
 * dropped timing in the browser, `insert_composition` existed headlessly only.
 * The semantics live here now (I11); a host holds state and I/O, nothing else.
 */

import type {
  TimelineClip,
  TimelineMarker,
  TimelineTrack
} from "../types.js";
import type { TimelineComposition } from "../composition.js";
import type {
  AnimationRole,
  ClipAnimation,
  CustomClipAnimation
} from "../animation/types.js";

/** The document shape every host already holds, plus its editor cursor. */
export interface TimelineOpState {
  fps: number;
  width: number;
  height: number;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  markers: TimelineMarker[];
  /** Playhead in ms. `split_clip` with no `atMs` cuts here. */
  playheadMs: number;
  /** Ids `target: "selected"` resolves against. */
  selectedClipIds: string[];
}

/** What the ops know about an asset to place it as a clip. */
export interface TimelineOpAsset {
  id: string;
  name: string;
  contentType: string;
  durationMs?: number;
  thumbnailAssetId?: string;
}

/** One custom-animation bake: a JS body plus the clip context it runs against. */
export interface TimelineOpBakeRequest {
  code: string;
  role: AnimationRole;
  durationMs: number;
  clipDurationMs: number;
  canvas: { width: number; height: number };
  params?: Record<string, number | string | boolean>;
  staggerCount?: number;
}

/** What a bake returns. Mirrors `BakeCustomAnimationResult` minus the logs. */
export interface TimelineOpBakeResult {
  ok: boolean;
  curves?: CustomClipAnimation["curves"];
  mask?: { direction: string; softness: number };
  error?: string;
}

/** Reads a composition by id and lists what this host offers. */
export interface TimelineOpCompositionLoader {
  get(id: string): Promise<TimelineComposition | null>;
  listIds(): Promise<string[]>;
}

/** Ids a host mints. Kept out of the ops so ids stay the host's to allocate. */
export type TimelineOpIdKind = "track" | "clip" | "anim" | "marker";

/** Everything an op needs that the document cannot answer. */
export interface TimelineOpContext {
  newId(kind: TimelineOpIdKind): string;
  /** Timestamp for a baked animation. Defaults to `new Date().toISOString()`. */
  now?(): string;
  /** Asset lookup for `add_media_clip`. Absent means this surface has none. */
  resolveAsset?(ref: string): Promise<TimelineOpAsset | null>;
  /** Bake for `preset: "custom"` with `code`. Absent means curves only. */
  bakeAnimation?(request: TimelineOpBakeRequest): Promise<TimelineOpBakeResult>;
  /** Composition library for `insert_composition`. */
  loadComposition?: TimelineOpCompositionLoader;
  /**
   * The host's SVG path parser (`parseSvgPath` from `./scene`). Passed in
   * rather than imported: the parser lives under `src/render`, which this
   * module stays clear of so mobile can compile it from source (AS2).
   */
  parseSvgPath?(d: string): { ok: boolean; error?: string };
}

/** What one op did. `error` set means `state` is the state that went in. */
/**
 * What an op hands back to its caller. Every op returns a JSON object (the
 * bridge serializes it for the tool result), so the shape is a record whose
 * keys the op decides.
 */
export type TimelineOpResult = Record<string, unknown>;

export interface TimelineOpOutcome {
  state: TimelineOpState;
  result: TimelineOpResult;
  changedClipIds: string[];
  error?: string;
}

/** The animation input `animate_clip` takes, before it is built. */
export interface TimelineAnimationInput {
  role: ClipAnimation["role"];
  preset: string;
  durationMs?: number;
  delayMs?: number;
  easing?: ClipAnimation["easing"];
  params?: ClipAnimation["params"];
  curves?: unknown;
  code?: string;
  mask?: unknown;
  custom?: { curves?: unknown; code?: string; mask?: unknown };
  stagger?: ClipAnimation["stagger"];
}
