/**
 * Transitions on a cut.
 *
 * The document keeps a transition on the incoming clip (`transitionIn`), and
 * the renderer cross-fades that clip in over the window while whatever sits
 * under it on the same track keeps playing. On a hard cut nothing sits under
 * it, so a dissolve needs the outgoing clip to keep going for the length of
 * the transition: that is what Premiere and Final Cut do with the outgoing
 * clip's handle. `applyTransitionAtCut` extends the abutting predecessor by
 * the transition length and sets the incoming clip's `transitionIn`, in one
 * step, so a default-transition key or a context-menu item produces a real
 * dissolve. A predecessor that cannot grow (time-remapped) is left alone and
 * the incoming clip fades from transparent instead.
 */

import {
  buildTransition,
  type TransitionParams
} from "@nodetool-ai/protocol/api-schemas/timeline-tool-params.js";
import { trimClip } from "./trimClip.js";
import type {
  ClipTransition,
  KnownClipTransition,
  TimelineClip
} from "./types.js";

export const DEFAULT_TRANSITION_MS = 500;

export interface TransitionAtCutInput {
  readonly outgoingClipId: string;
  readonly incomingClipId: string;
  /** The requested visible transition length. */
  readonly durationMs?: number;
  /** The requested timeline overlap. If omitted, durationMs is used. */
  readonly overlapMs?: number;
  readonly type?: TransitionParams["type"];
  readonly easing?: TransitionParams["easing"];
  readonly color?: TransitionParams["color"];
  readonly direction?: TransitionParams["direction"];
  readonly softness?: TransitionParams["softness"];
}

export interface TransitionAtCutOperation {
  readonly op: "apply_transition_at_cut";
  readonly outgoingClipId: string;
  readonly incomingClipId: string;
  readonly overlapMs: number;
  readonly durationMs: number;
  readonly type: TransitionParams["type"];
  readonly easing?: TransitionParams["easing"];
  readonly color?: TransitionParams["color"];
  readonly direction?: TransitionParams["direction"];
  readonly softness?: TransitionParams["softness"];
}

export interface TransitionAtCutCandidate {
  readonly kind: "transition_at_cut";
  readonly outgoingClipId: string;
  readonly incomingClipId: string;
  readonly overlapMs: number;
  readonly durationMs: number;
  readonly type: TransitionParams["type"];
  readonly transition: KnownClipTransition;
  /** A single document operation for the host's undo boundary. */
  readonly operation: TransitionAtCutOperation;
}

export interface TransitionAtCutRefusal {
  readonly ok: false;
  readonly code:
    | "missing_clip"
    | "not_adjacent"
    | "invalid_timing"
    | "too_long";
  readonly error: string;
}

export type TransitionAtCutPlan =
  | { readonly ok: true; readonly candidate: TransitionAtCutCandidate }
  | TransitionAtCutRefusal;

export type TransitionAtCutApplyResult =
  | { readonly ok: true; readonly clips: TimelineClip[]; readonly description: string }
  | TransitionAtCutRefusal;

type TransitionAtCutFields = Omit<TransitionParams, "durationMs">;

const clipEndMs = (c: TimelineClip): number => c.startMs + c.durationMs;

function refuse(
  code: TransitionAtCutRefusal["code"],
  error: string
): TransitionAtCutRefusal {
  return { ok: false, code, error };
}

function transitionFields(
  input: TransitionAtCutInput,
  type: TransitionParams["type"]
): TransitionAtCutFields {
  const fields: TransitionAtCutFields = { type };
  if (input.easing !== undefined) fields.easing = input.easing;
  if (input.color !== undefined) fields.color = input.color;
  if (input.direction !== undefined) fields.direction = input.direction;
  if (input.softness !== undefined) fields.softness = input.softness;
  return fields;
}

function adjacentAtCut(
  clips: readonly TimelineClip[],
  outgoing: TimelineClip,
  incoming: TimelineClip
): boolean {
  if (
    outgoing.trackId !== incoming.trackId ||
    outgoing.startMs >= incoming.startMs ||
    clipEndMs(outgoing) < incoming.startMs - 1
  ) {
    return false;
  }
  // A generated transition owns the cut between these two clips. Another
  // clip starting in that interval would make the selected pair ambiguous.
  return !clips.some(
    (clip) =>
      clip.id !== outgoing.id &&
      clip.id !== incoming.id &&
      clip.trackId === outgoing.trackId &&
      clip.startMs > outgoing.startMs &&
      clip.startMs < incoming.startMs
  );
}

/** Plan a bounded transition candidate for two explicitly selected clips. */
export function planTransitionAtCut(
  clips: readonly TimelineClip[],
  input: TransitionAtCutInput
): TransitionAtCutPlan {
  const outgoing = clips.find((clip) => clip.id === input.outgoingClipId);
  const incoming = clips.find((clip) => clip.id === input.incomingClipId);
  if (!outgoing || !incoming) {
    return refuse(
      "missing_clip",
      "Transition requires an outgoing and incoming clip that both exist."
    );
  }
  if (outgoing.id === incoming.id || !adjacentAtCut(clips, outgoing, incoming)) {
    return refuse(
      "not_adjacent",
      "Transition requires two adjacent clips on the same track, in timeline order."
    );
  }
  if (input.durationMs === undefined && input.overlapMs === undefined) {
    return refuse(
      "invalid_timing",
      "Transition requires an explicit overlapMs or durationMs."
    );
  }
  if (
    (input.durationMs !== undefined &&
      (!Number.isFinite(input.durationMs) || input.durationMs <= 0)) ||
    (input.overlapMs !== undefined &&
      (!Number.isFinite(input.overlapMs) || input.overlapMs <= 0))
  ) {
    return refuse(
      "invalid_timing",
      "Transition overlap and duration must be finite and greater than zero."
    );
  }
  if (
    input.durationMs !== undefined &&
    input.overlapMs !== undefined &&
    Math.abs(input.durationMs - input.overlapMs) > 0.001
  ) {
    return refuse(
      "invalid_timing",
      "Transition overlapMs and durationMs must describe the same length."
    );
  }
  const length = input.durationMs ?? input.overlapMs!;
  const maxLength = Math.min(outgoing.durationMs, incoming.durationMs);
  if (length > maxLength) {
    return refuse(
      "too_long",
      `Transition length cannot exceed the shorter clip (${maxLength}ms).`
    );
  }
  const type = input.type ?? "crossfade";
  const fields = transitionFields(input, type);
  const transition = buildTransition({
    durationMs: length,
    ...fields
  });
  const operation: TransitionAtCutOperation = {
    op: "apply_transition_at_cut",
    outgoingClipId: outgoing.id,
    incomingClipId: incoming.id,
    overlapMs: length,
    durationMs: length,
    ...fields
  };
  return {
    ok: true,
    candidate: {
      kind: "transition_at_cut",
      outgoingClipId: outgoing.id,
      incomingClipId: incoming.id,
      overlapMs: length,
      durationMs: length,
      type,
      transition,
      operation
    }
  };
}

/**
 * Apply one planned cut candidate, without touching either clip's takes. The
 * outgoing clip grows under the transition together with the linked clips
 * that end with it, within `options`, as {@link applyTransitionAtCut} does.
 */
export function applyTransitionAtCutCandidate(
  clips: readonly TimelineClip[],
  candidate: TransitionAtCutCandidate,
  options: TransitionGrowthOptions = {}
): TransitionAtCutApplyResult {
  const plan = planTransitionAtCut(clips, candidate.operation);
  if (!plan.ok) return plan;
  const next = applyTransitionAtCutPair(
    clips,
    plan.candidate.outgoingClipId,
    plan.candidate.incomingClipId,
    plan.candidate.durationMs,
    plan.candidate.transition,
    options
  );
  return {
    ok: true,
    clips: next,
    description: `Apply ${plan.candidate.type} transition from ${plan.candidate.outgoingClipId} to ${plan.candidate.incomingClipId} (${plan.candidate.durationMs}ms) as one undoable cut operation.`
  };
}

/**
 * The clip on `clip`'s track that ends at (±1 ms) or already overlaps its
 * start: the one a transition into `clip` plays over.
 */
export function transitionPredecessor(
  clips: readonly TimelineClip[],
  clip: TimelineClip
): TimelineClip | undefined {
  let best: TimelineClip | undefined;
  for (const c of clips) {
    if (c.id === clip.id || c.trackId !== clip.trackId) continue;
    if (c.startMs >= clip.startMs) continue;
    const end = clipEndMs(c);
    if (end < clip.startMs - 1) continue;
    if (!best || end > clipEndMs(best)) best = c;
  }
  return best;
}

/** Longest transition `clip` can carry: no more than itself or its predecessor. */
export function maxTransitionMs(
  clips: readonly TimelineClip[],
  clip: TimelineClip
): number {
  const prev = transitionPredecessor(clips, clip);
  return prev ? Math.min(clip.durationMs, prev.durationMs) : clip.durationMs;
}

function applyTransitionAtCutPair(
  clips: readonly TimelineClip[],
  outgoingClipId: string,
  incomingClipId: string,
  durationMs: number,
  transition: KnownClipTransition,
  options: TransitionGrowthOptions
): TimelineClip[] {
  const incoming = clips.find((c) => c.id === incomingClipId);
  const outgoing = clips.find((c) => c.id === outgoingClipId);
  if (!incoming || !outgoing) {
    throw new Error("applyTransitionAtCutPair: selected clips not found");
  }
  const wanted = transitionLengthAtCut(outgoing, incoming, durationMs);
  const missing = transitionGrowthMs(outgoing, incoming, wanted);
  // A unit that cannot grow leaves the incoming clip to fade in on its own.
  const grown =
    missing > 0
      ? growPredecessor(clips, outgoing, missing, options)
      : new Map<string, TimelineClip>();

  const transitionIn: ClipTransition = { ...transition, durationMs: wanted };

  return clips.map((c) => {
    if (c.id === incomingClipId) return { ...c, transitionIn };
    return grown.get(c.id) ?? c;
  });
}

/** How long a transition of `durationMs` at this cut can run. */
export function transitionLengthAtCut(
  outgoing: TimelineClip,
  incoming: TimelineClip,
  durationMs: number
): number {
  return Math.max(
    0,
    Math.min(durationMs, incoming.durationMs, outgoing.durationMs)
  );
}

/** How far the outgoing clip must grow so the two overlap for `lengthMs`. */
export function transitionGrowthMs(
  outgoing: TimelineClip,
  incoming: TimelineClip,
  lengthMs: number
): number {
  const overlap = clipEndMs(outgoing) - incoming.startMs;
  return Math.max(0, lengthMs - Math.max(0, overlap));
}

/**
 * `prev` and the linked clips that end with it: the unit a transition grows
 * so linked picture and sound keep the same out-point.
 */
export function transitionGrowthUnit(
  clips: readonly TimelineClip[],
  prev: TimelineClip
): TimelineClip[] {
  const unit = [prev];
  if (prev.linkId !== undefined) {
    for (const c of clips) {
      if (
        c.id !== prev.id &&
        c.linkId === prev.linkId &&
        Math.abs(clipEndMs(c) - clipEndMs(prev)) <= 1
      ) {
        unit.push(c);
      }
    }
  }
  return unit;
}

/** Host policy for growing the predecessor under a transition. */
export interface TransitionGrowthOptions {
  /**
   * The source length of a clip's media, when known. The predecessor (and
   * every linked clip grown with it) may not grow past it.
   */
  readonly sourceDurationMs?: (clip: TimelineClip) => number | undefined;
  /** Whether a clip may be extended. A locked predecessor is left alone. */
  readonly canExtend?: (clip: TimelineClip) => boolean;
}

/**
 * Extend `prev` and the linked clips that end with it by `missingMs`, or
 * nothing when any of them cannot grow, so linked picture and sound keep the
 * same out-point.
 */
function growPredecessor(
  clips: readonly TimelineClip[],
  prev: TimelineClip,
  missingMs: number,
  options: TransitionGrowthOptions
): Map<string, TimelineClip> {
  const grown = new Map<string, TimelineClip>();
  for (const c of transitionGrowthUnit(clips, prev)) {
    if (options.canExtend && !options.canExtend(c)) return new Map();
    try {
      grown.set(
        c.id,
        trimClip(c, "end", missingMs, options.sourceDurationMs?.(c))
      );
    } catch {
      // A clip that cannot grow (time-remapped, out of source) leaves the
      // whole unit alone, and the incoming clip fades in on its own.
      return new Map();
    }
  }
  return grown;
}

/**
 * Give `clipId` a transition of `durationMs`, extending an abutting
 * predecessor under it so the two overlap for that long. A predecessor that
 * already overlaps is grown only by what the transition still lacks, together
 * with the linked clips that end with it, and only within `options`. An
 * explicit transition replaces the clip's current transition. Without one,
 * the current transition is resized or a crossfade is created.
 */
export function applyTransitionAtCut(
  clips: readonly TimelineClip[],
  clipId: string,
  durationMs: number,
  transition?: KnownClipTransition,
  options: TransitionGrowthOptions = {}
): TimelineClip[] {
  const clip = clips.find((c) => c.id === clipId);
  if (!clip) throw new Error(`applyTransitionAtCut: clip ${clipId} not found`);
  const wanted = Math.max(0, Math.min(durationMs, maxTransitionMs(clips, clip)));
  const prev = transitionPredecessor(clips, clip);

  let grown = new Map<string, TimelineClip>();
  if (prev && wanted > 0) {
    const overlap = clipEndMs(prev) - clip.startMs;
    const missing = wanted - Math.max(0, overlap);
    if (missing > 0) grown = growPredecessor(clips, prev, missing, options);
  }

  const existing = clip.transitionIn;
  const transitionIn: ClipTransition = transition
    ? { ...transition, durationMs: wanted }
    : existing && existing.durationMs > 0
      ? { ...existing, durationMs: wanted }
      : { type: "crossfade", durationMs: wanted };

  return clips.map((c) => {
    if (c.id === clipId) return { ...c, transitionIn };
    return grown.get(c.id) ?? c;
  });
}

/** Drop `clipId`'s transition; the predecessor keeps whatever length it has. */
export function removeTransitionAtCut(
  clips: readonly TimelineClip[],
  clipId: string
): TimelineClip[] {
  return clips.map((c) => {
    if (c.id !== clipId || c.transitionIn === undefined) return c;
    const { transitionIn: _dropped, ...rest } = c;
    return rest;
  });
}
