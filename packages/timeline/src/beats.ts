/**
 * Beat grids and clip snapping.
 *
 * `detect_audio_events` reports onset times and a tempo; this turns either of
 * those into a grid of absolute times and moves or trims clips onto it. Every
 * function here is pure arithmetic over plain numbers, so the capability op,
 * the browser twin and the tests all read the same rules.
 */

/** Times a grid may hold, so a runaway `count` cannot fill a document. */
export const MAX_BEAT_GRID_POINTS = 2048;

/** Distance a boundary may travel to reach a beat, when the caller names none. */
export const DEFAULT_BEAT_TOLERANCE_MS = 60;

/**
 * Where a grid comes from: onset times measured off the audio, or a tempo.
 * Exactly one of `onsetsMs` and `bpm`.
 */
export interface BeatGridSpec {
  /** Absolute times in ms. Order and duplicates do not matter. */
  onsetsMs?: readonly number[];
  /** Beats per minute. */
  bpm?: number;
  /** Where beat one sits, in ms. Defaults to 0. */
  offsetMs?: number;
  /** Beats to generate from `bpm`. Required with `bpm`. */
  count?: number;
}

/**
 * Build the absolute grid times, ascending and deduplicated.
 *
 * Throws rather than returning an error value: every caller has to stop
 * anyway, and the message is what the agent needs to read.
 */
export function buildBeatGrid(spec: BeatGridSpec): number[] {
  const hasOnsets = spec.onsetsMs !== undefined;
  const hasBpm = spec.bpm !== undefined;
  if (hasOnsets && hasBpm) {
    throw new Error(
      "A beat grid takes exactly one of `onsets_ms` and `bpm`; both were given."
    );
  }
  if (!hasOnsets && !hasBpm) {
    throw new Error(
      "A beat grid needs `onsets_ms` (times in ms, e.g. detect_audio_events' " +
        "`onsets.times` multiplied by 1000) or `bpm` with `count`."
    );
  }

  if (hasOnsets) {
    const onsets = spec.onsetsMs ?? [];
    const times: number[] = [];
    for (const onset of onsets) {
      if (!Number.isFinite(onset) || onset < 0) {
        throw new Error(
          `onsets_ms holds ${String(onset)}; every onset must be a time in ms at or after zero.`
        );
      }
      times.push(Math.round(onset));
    }
    if (times.length === 0) {
      throw new Error("onsets_ms is empty; there is nothing to snap to.");
    }
    if (times.length > MAX_BEAT_GRID_POINTS) {
      throw new Error(
        `onsets_ms holds ${times.length} times; at most ${MAX_BEAT_GRID_POINTS}.`
      );
    }
    return dedupeSorted(times);
  }

  const bpm = spec.bpm ?? 0;
  if (!Number.isFinite(bpm) || bpm <= 0) {
    throw new Error(`bpm must be a positive number; got ${String(spec.bpm)}.`);
  }
  const offsetMs = spec.offsetMs ?? 0;
  if (!Number.isFinite(offsetMs) || offsetMs < 0) {
    throw new Error(
      `offset_ms must be a time in ms at or after zero; got ${String(spec.offsetMs)}.`
    );
  }
  const count = spec.count ?? 0;
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(
      `count must be a positive whole number of beats; got ${String(spec.count)}.`
    );
  }
  if (count > MAX_BEAT_GRID_POINTS) {
    throw new Error(
      `count is ${count}; at most ${MAX_BEAT_GRID_POINTS} beats per grid.`
    );
  }

  const intervalMs = 60000 / bpm;
  const times: number[] = [];
  // Each beat is `offset + i * interval` rather than an accumulated sum, so a
  // fractional interval (140 BPM is 428.571… ms) does not drift over a long
  // grid — the same rule `buildSnapPoints` follows for its ticks.
  for (let i = 0; i < count; i++) {
    times.push(Math.round(offsetMs + i * intervalMs));
  }
  return dedupeSorted(times);
}

function dedupeSorted(times: number[]): number[] {
  return Array.from(new Set(times)).sort((a, b) => a - b);
}

/**
 * Beats needed to cover `untilMs` at `bpm` starting at `offsetMs`, capped.
 *
 * `snap_to_beats` takes a tempo with no count, because the count that matters
 * is whatever reaches the last clip.
 */
export function beatCountToCover(
  bpm: number,
  offsetMs: number,
  untilMs: number
): number {
  if (!Number.isFinite(bpm) || bpm <= 0) return 0;
  const intervalMs = 60000 / bpm;
  const beyond = Math.max(0, untilMs - offsetMs);
  // One past the beat that reaches `untilMs`, so a boundary sitting just after
  // the last whole beat still has a later beat to snap forward to.
  return Math.min(MAX_BEAT_GRID_POINTS, Math.floor(beyond / intervalMs) + 2);
}

/** The clip fields snapping reads and writes. */
export interface SnapClipInput {
  id: string;
  startMs: number;
  durationMs: number;
}

/** Which boundary of a clip is put on the grid. */
export type SnapBoundaryMode = "start" | "end" | "both";

/**
 * How a boundary reaches the grid. `move` slides the whole clip and keeps its
 * length; `trim` holds the opposite boundary and changes the length — so
 * trimming the end keeps `startMs`, and trimming the start keeps the end.
 */
export type SnapAction = "move" | "trim";

export interface SnapClipBounds {
  startMs: number;
  endMs: number;
  durationMs: number;
}

/** What one clip did, whether or not it moved. */
export interface ClipSnapResult {
  clipId: string;
  snapped: boolean;
  before: SnapClipBounds;
  after: SnapClipBounds;
  /** Signed shift of each boundary in ms; zero where it did not move. */
  delta: { startMs: number; endMs: number };
  /** Why nothing moved. Set only when `snapped` is false. */
  reason?: string;
}

export interface SnapClipsToGridOptions {
  toleranceMs?: number;
  mode?: SnapBoundaryMode;
  action?: SnapAction;
}

export interface SnapClipsToGridResult {
  toleranceMs: number;
  mode: SnapBoundaryMode;
  action: SnapAction;
  snapped: number;
  skipped: number;
  /** One entry per input clip, in input order. */
  clips: ClipSnapResult[];
}

/**
 * The grid time nearest `timeMs` within `toleranceMs`, or null.
 *
 * Ties go to the earlier time, matching `snap()` — an editor that resolved a
 * tie differently per call would place two identical cuts in two places.
 */
export function nearestGridTime(
  timeMs: number,
  grid: readonly number[],
  toleranceMs: number
): number | null {
  let best: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of grid) {
    const distance = Math.abs(candidate - timeMs);
    if (distance > toleranceMs) continue;
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
      continue;
    }
    if (distance === bestDistance && best !== null && candidate < best) {
      best = candidate;
    }
  }
  return best;
}

function bounds(startMs: number, durationMs: number): SnapClipBounds {
  return { startMs, endMs: startMs + durationMs, durationMs };
}

/** `"90ms from the nearest beat"`, or that there is no beat in reach at all. */
function distanceNote(
  label: string,
  timeMs: number,
  grid: readonly number[]
): string {
  let nearest: number | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of grid) {
    const distance = Math.abs(candidate - timeMs);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  if (nearest === null) return `${label} ${timeMs}ms has no beat to reach`;
  return `${label} ${timeMs}ms is ${Math.round(nearestDistance)}ms from the nearest beat (${nearest}ms)`;
}

/**
 * Put each clip's chosen boundary on the nearest grid time within tolerance.
 *
 * A clip whose boundary is out of tolerance is reported with `snapped: false`
 * and a reason rather than dropped from the result: the caller has to be able
 * to see which clips did not move and why, and a silent skip reads as success.
 */
export function snapClipsToGrid(
  clips: readonly SnapClipInput[],
  grid: readonly number[],
  options: SnapClipsToGridOptions = {}
): SnapClipsToGridResult {
  const toleranceMs = Math.max(0, options.toleranceMs ?? DEFAULT_BEAT_TOLERANCE_MS);
  const mode = options.mode ?? "start";
  const action = options.action ?? "move";

  const results: ClipSnapResult[] = [];
  for (const clip of clips) {
    results.push(snapOneClip(clip, grid, toleranceMs, mode, action));
  }

  const snapped = results.filter((result) => result.snapped).length;
  return {
    toleranceMs,
    mode,
    action,
    snapped,
    skipped: results.length - snapped,
    clips: results
  };
}

function snapOneClip(
  clip: SnapClipInput,
  grid: readonly number[],
  toleranceMs: number,
  mode: SnapBoundaryMode,
  action: SnapAction
): ClipSnapResult {
  const before = bounds(clip.startMs, clip.durationMs);
  const unchanged = (reason: string): ClipSnapResult => ({
    clipId: clip.id,
    snapped: false,
    before,
    after: before,
    delta: { startMs: 0, endMs: 0 },
    reason
  });

  if (grid.length === 0) {
    return unchanged("the beat grid is empty");
  }

  const wantsStart = mode === "start" || mode === "both";
  const wantsEnd = mode === "end" || mode === "both";
  const startTarget = wantsStart
    ? nearestGridTime(before.startMs, grid, toleranceMs)
    : null;
  const endTarget = wantsEnd
    ? nearestGridTime(before.endMs, grid, toleranceMs)
    : null;

  if (startTarget === null && endTarget === null) {
    const notes: string[] = [];
    if (wantsStart) notes.push(distanceNote("start", before.startMs, grid));
    if (wantsEnd) notes.push(distanceNote("end", before.endMs, grid));
    return unchanged(`${notes.join("; ")}; tolerance is ${toleranceMs}ms`);
  }

  let after: SnapClipBounds;
  if (action === "move") {
    // One boundary decides the shift and the length rides along. With `both`
    // the start wins: a move cannot satisfy two boundaries at once, and the
    // start is where a cut is read from.
    const shift =
      startTarget !== null
        ? startTarget - before.startMs
        : (endTarget ?? before.endMs) - before.endMs;
    after = bounds(before.startMs + shift, before.durationMs);
  } else {
    const startMs = startTarget ?? before.startMs;
    const endMs = endTarget ?? before.endMs;
    after = bounds(startMs, endMs - startMs);
  }

  if (after.startMs < 0) {
    return unchanged(
      `snapping would start the clip at ${after.startMs}ms, before zero`
    );
  }
  if (after.durationMs <= 0) {
    return unchanged(
      `snapping would leave the clip ${after.durationMs}ms long`
    );
  }
  if (
    after.startMs === before.startMs &&
    after.durationMs === before.durationMs
  ) {
    return {
      clipId: clip.id,
      snapped: false,
      before,
      after,
      delta: { startMs: 0, endMs: 0 },
      reason: "already on the grid"
    };
  }

  return {
    clipId: clip.id,
    snapped: true,
    before,
    after,
    delta: {
      startMs: after.startMs - before.startMs,
      endMs: after.endMs - before.endMs
    }
  };
}
