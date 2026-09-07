/**
 * Peak-preserving keyframe simplification.
 *
 * A dense series (an audio envelope, a tracked motion curve) has far more
 * points than a hand-authored keyframe list needs, but naive decimation
 * (`every Nth point`, a fixed-size average) is the wrong tool: it treats a
 * transient the same as noise and can erase the one spike a caller cares
 * about. `simplifyKeyframes` runs Ramer-Douglas-Peucker against the value
 * axis (a point's vertical distance from the chord connecting its
 * neighbours), but first marks every local extremum whose prominence clears
 * `tolerance` as mandatory — RDP is free to drop everything else, never a
 * peak. `envelopeToKeyframes` is the audio-specific front door: it smooths a
 * raw RMS series through an attack/release follower, maps it into an output
 * range, and simplifies the result.
 *
 * Pure math only — no I/O, no other `@nodetool-ai/timeline` module. This
 * keeps the file usable from anywhere in the package (or outside it) without
 * pulling in the render/document graph.
 */

/** One point on a value-over-time curve. */
export interface KeyframePoint {
  readonly timeMs: number;
  readonly value: number;
}

export interface SimplifyKeyframesOptions {
  /** Vertical distance (in the series' own value units) below which a point is droppable. */
  readonly tolerance: number;
  /** Hard cap on the output length. Exceeded only when `preservePeaks` mandatory vertices alone are more than this — then the highest-prominence ones survive. */
  readonly maxPoints?: number;
  /** Force every prominent local extremum to survive simplification. Default true. */
  readonly preservePeaks?: boolean;
}

/** A raw envelope sample — an RMS reading at a point in source time. */
export interface EnvelopeFrame {
  readonly timeMs: number;
  readonly rms: number;
}

export interface EnvelopeToKeyframesOptions {
  /** Time constant (ms) for the follower's rise. 0 or less means an instant jump. */
  readonly attackMs: number;
  /** Time constant (ms) for the follower's fall. 0 or less means an instant drop. */
  readonly releaseMs: number;
  /** The follower's value range that maps onto `outputRange`, clamped at both ends. */
  readonly inputRange: readonly [number, number];
  /** The keyframe value range `inputRange` maps onto. */
  readonly outputRange: readonly [number, number];
  readonly tolerance: number;
  readonly maxPoints?: number;
  readonly preservePeaks?: boolean;
}

const DEFAULT_MAX_TOLERANCE_DOUBLINGS = 64;

/** Ascending-by-`timeMs` copy — every function here assumes this ordering. */
function sortedByTime<T extends { readonly timeMs: number }>(
  points: readonly T[]
): T[] {
  return [...points].sort((a, b) => a.timeMs - b.timeMs);
}

// ---------------------------------------------------------------------------
// Ramer-Douglas-Peucker over the value axis
// ---------------------------------------------------------------------------

/**
 * Indices RDP keeps out of `points`, at `tolerance`. Iterative (an explicit
 * stack, not recursion) so a long, mostly-flat series can't blow the call
 * stack the way a naive recursive RDP would on a near-monotonic run.
 *
 * The "distance" a point is judged by is its vertical gap from the straight
 * line connecting the two ends of the span it falls in — a value-tolerance,
 * not a 2D Euclidean one, because `tolerance` is meant to read in the
 * series' own units (RMS, a normalized 0..1 property value), not a mix of
 * milliseconds and those units.
 */
function rdpKeepIndices(
  points: readonly KeyframePoint[],
  tolerance: number
): Set<number> {
  const n = points.length;
  const keep = new Set<number>();
  if (n === 0) return keep;
  keep.add(0);
  keep.add(n - 1);
  if (n <= 2) return keep;

  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length > 0) {
    const span = stack.pop();
    if (!span) break;
    const [start, end] = span;
    if (end <= start + 1) continue;
    const first = points[start];
    const last = points[end];
    const dt = last.timeMs - first.timeMs;
    let maxDistance = -1;
    let maxIndex = -1;
    for (let index = start + 1; index < end; index += 1) {
      const point = points[index];
      const expected =
        dt === 0
          ? first.value
          : first.value +
            ((point.timeMs - first.timeMs) / dt) * (last.value - first.value);
      const distance = Math.abs(point.value - expected);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = index;
      }
    }
    if (maxDistance > tolerance) {
      keep.add(maxIndex);
      stack.push([start, maxIndex]);
      stack.push([maxIndex, end]);
    }
  }
  return keep;
}

// ---------------------------------------------------------------------------
// Local extrema and their prominence
// ---------------------------------------------------------------------------

interface Extremum {
  readonly index: number;
  readonly kind: "max" | "min";
  readonly prominence: number;
}

/**
 * Every strict local extremum in `points`, with a prominence measured
 * against its two immediate neighbouring extrema (or the series' own ends,
 * for the first/last extremum) — how far the peak stands above the higher of
 * its two adjacent valleys, or the valley sits below the lower of its two
 * adjacent peaks.
 *
 * This is a local proxy for topographic prominence, not the textbook
 * definition (which bounds a peak by the nearest *taller* peak on each side,
 * however far that is) — computing that exactly is worst-case quadratic, and
 * the local version is O(n), answers the question this module needs ("does
 * this bump matter against what's next to it"), and is exactly the value a
 * single isolated transient reports.
 */
function findExtrema(points: readonly KeyframePoint[]): Extremum[] {
  const n = points.length;
  if (n < 3) return [];

  // Collapse runs of equal value to their first index — a flat plateau has
  // no interior slope to compare, and comparing every repeated sample as its
  // own candidate would report a spurious extremum at each plateau edge.
  const distinct: number[] = [0];
  for (let index = 1; index < n; index += 1) {
    if (points[index].value !== points[distinct[distinct.length - 1]].value) {
      distinct.push(index);
    }
  }

  type Candidate = { index: number; kind: "max" | "min" };
  const candidates: Candidate[] = [];
  for (let k = 1; k < distinct.length - 1; k += 1) {
    const prev = points[distinct[k - 1]].value;
    const current = points[distinct[k]].value;
    const next = points[distinct[k + 1]].value;
    if (current > prev && current > next) {
      candidates.push({ index: distinct[k], kind: "max" });
    } else if (current < prev && current < next) {
      candidates.push({ index: distinct[k], kind: "min" });
    }
  }

  return candidates.map((candidate, position) => {
    const leftValue =
      position > 0
        ? points[candidates[position - 1].index].value
        : points[0].value;
    const rightValue =
      position < candidates.length - 1
        ? points[candidates[position + 1].index].value
        : points[n - 1].value;
    const value = points[candidate.index].value;
    const prominence =
      candidate.kind === "max"
        ? value - Math.max(leftValue, rightValue)
        : Math.min(leftValue, rightValue) - value;
    return { index: candidate.index, kind: candidate.kind, prominence };
  });
}

/** Indices of every extremum whose prominence clears `tolerance`. */
function mandatoryPeakIndices(
  points: readonly KeyframePoint[],
  tolerance: number
): Set<number> {
  const indices = new Set<number>();
  for (const extremum of findExtrema(points)) {
    if (extremum.prominence > tolerance) indices.add(extremum.index);
  }
  return indices;
}

// ---------------------------------------------------------------------------
// simplifyKeyframes
// ---------------------------------------------------------------------------

function simplifyAt(
  points: readonly KeyframePoint[],
  tolerance: number,
  preservePeaks: boolean
): KeyframePoint[] {
  const kept = rdpKeepIndices(points, tolerance);
  if (preservePeaks) {
    for (const index of mandatoryPeakIndices(points, tolerance)) {
      kept.add(index);
    }
  }
  return [...kept].sort((a, b) => a - b).map((index) => points[index]);
}

/**
 * Fallback when even a very large tolerance can't bring the mandatory peaks
 * under `maxPoints`: keep both endpoints and the highest-prominence peaks
 * that fit, dropping the rest. Never returns more than `maxPoints` points.
 */
function capToBudget(
  points: readonly KeyframePoint[],
  maxPoints: number,
  preservePeaks: boolean
): KeyframePoint[] {
  if (maxPoints <= 0) return [];
  if (points.length <= maxPoints) return [...points];

  const anchors = new Set<number>([0, points.length - 1]);
  if (maxPoints <= anchors.size) {
    // Not even room for both ends — take an even stride through the series.
    const step = (points.length - 1) / Math.max(1, maxPoints - 1);
    const chosen = new Set<number>();
    for (let i = 0; i < maxPoints; i += 1) {
      chosen.add(Math.round(i * step));
    }
    return [...chosen].sort((a, b) => a - b).map((index) => points[index]);
  }

  const budgetForPeaks = maxPoints - anchors.size;
  const ranked = preservePeaks
    ? findExtrema(points).sort((a, b) => b.prominence - a.prominence)
    : [];
  for (const extremum of ranked.slice(0, budgetForPeaks)) {
    anchors.add(extremum.index);
  }
  return [...anchors].sort((a, b) => a - b).map((index) => points[index]);
}

/**
 * Simplify a dense keyframe series with Ramer-Douglas-Peucker, guaranteeing
 * every prominent local extremum survives.
 *
 * When `maxPoints` is set and the first pass overshoots it, `tolerance` is
 * doubled and the pass repeated — both the RDP epsilon and the peak-
 * prominence cutoff are the same number, so raising it also shrinks the
 * mandatory set, and the two converge together. If mandatory peaks alone
 * still exceed the budget (or `maxPoints` is smaller than 2), the highest-
 * prominence ones are kept and the rest dropped; a caller cannot ask for a
 * pass that returns more points than it does keep more peaks than fit.
 */
export function simplifyKeyframes(
  points: readonly KeyframePoint[],
  options: SimplifyKeyframesOptions
): KeyframePoint[] {
  const sorted = sortedByTime(points);
  if (sorted.length <= 2) return sorted;

  const preservePeaks = options.preservePeaks ?? true;
  const tolerance = Math.max(0, options.tolerance);
  const maxPoints = options.maxPoints;

  if (maxPoints != null && maxPoints < 2) {
    return capToBudget(sorted, maxPoints, preservePeaks);
  }

  let currentTolerance = tolerance;
  let result = simplifyAt(sorted, currentTolerance, preservePeaks);
  if (maxPoints == null) return result;

  let doublings = 0;
  while (
    result.length > maxPoints &&
    doublings < DEFAULT_MAX_TOLERANCE_DOUBLINGS
  ) {
    currentTolerance = currentTolerance > 0 ? currentTolerance * 2 : 1e-9;
    result = simplifyAt(sorted, currentTolerance, preservePeaks);
    doublings += 1;
    if (process.env.DEBUG_SIMPLIFY) console.error('iter', doublings, currentTolerance, result.length);
  }
  return result.length > maxPoints
    ? capToBudget(sorted, maxPoints, preservePeaks)
    : result;
}

// ---------------------------------------------------------------------------
// envelopeToKeyframes
// ---------------------------------------------------------------------------

/**
 * An asymmetric one-pole follower: rises with time constant `attackMs`,
 * falls with `releaseMs`. Each step's coefficient accounts for the actual
 * gap to the previous frame, so an irregular hop size still reaches the same
 * time constant rather than one tuned for a fixed frame rate.
 */
function followEnvelope(
  frames: readonly EnvelopeFrame[],
  attackMs: number,
  releaseMs: number
): KeyframePoint[] {
  const out: KeyframePoint[] = [];
  let smoothed = 0;
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    if (index === 0) {
      smoothed = frame.rms;
    } else {
      const dtMs = Math.max(0, frame.timeMs - frames[index - 1].timeMs);
      const rising = frame.rms > smoothed;
      const timeConstant = rising ? attackMs : releaseMs;
      const alpha =
        timeConstant <= 0 ? 1 : 1 - Math.exp(-dtMs / timeConstant);
      smoothed = smoothed + alpha * (frame.rms - smoothed);
    }
    out.push({ timeMs: frame.timeMs, value: smoothed });
  }
  return out;
}

/** Map `value` from `[lo, hi]` to `[outLo, outHi]`, clamped at both ends. */
function mapRange(
  value: number,
  [lo, hi]: readonly [number, number],
  [outLo, outHi]: readonly [number, number]
): number {
  const span = hi - lo;
  const t = span === 0 ? 0 : (value - lo) / span;
  const clamped = Math.min(1, Math.max(0, t));
  return outLo + clamped * (outHi - outLo);
}

/**
 * Turn a raw RMS envelope into an animatable keyframe series: smooth it
 * through an attack/release follower, map the follower's range onto the
 * output property's range, and simplify without losing its peaks.
 */
export function envelopeToKeyframes(
  frames: readonly EnvelopeFrame[],
  options: EnvelopeToKeyframesOptions
): KeyframePoint[] {
  if (frames.length === 0) return [];
  const sorted = sortedByTime(frames);
  const followed = followEnvelope(sorted, options.attackMs, options.releaseMs);
  const mapped = followed.map((point) => ({
    timeMs: point.timeMs,
    value: mapRange(point.value, options.inputRange, options.outputRange)
  }));
  return simplifyKeyframes(mapped, {
    tolerance: options.tolerance,
    maxPoints: options.maxPoints,
    preservePeaks: options.preservePeaks
  });
}
