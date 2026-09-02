/**
 * svgPath — the subset of SVG path data the timeline draws, parsed once into
 * absolute segments.
 *
 * Two things read this module: a clip's `ClipMask` with `kind: "path"` (T12),
 * and — later — a shape clip's own `d` (T16). Both want the same two steps and
 * nothing more, so the seam is deliberately small:
 *
 * 1. {@link parseSvgPath} turns path data into {@link PathSegment}[] with every
 *    coordinate **absolute**, in the path's own units (normalized 0..1 for a
 *    mask, likewise for a shape). Relative commands are resolved here, so a
 *    consumer never tracks a current point.
 * 2. {@link tracePath} replays those segments onto any {@link PathSink} —
 *    a Canvas 2D context, or a flattener that walks them by arc length for
 *    trim and dashes — with a scale and offset applied on the way.
 *
 * Only `M L C Q Z` (absolute and relative) are read. Everything else is
 * refused by name rather than approximated: a mask silently missing its arcs
 * is a worse answer than one the validator reports as `mask_path_invalid`.
 */

/** One absolute path segment. `x`/`y` are the point the segment ends at. */
export type PathSegment =
  | { kind: "move"; x: number; y: number }
  | { kind: "line"; x: number; y: number }
  | {
      kind: "cubic";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      x: number;
      y: number;
    }
  | { kind: "quad"; x1: number; y1: number; x: number; y: number }
  | { kind: "close" };

/** What {@link parseSvgPath} answers: the segments, or why it could not. */
export type SvgPathResult =
  | { ok: true; segments: PathSegment[] }
  | { ok: false; error: string };

/** The commands this parser reads, for an error message that says what to use. */
export const SVG_PATH_COMMANDS = "M, L, C, Q, Z (absolute or relative)";

/** How many numbers each command consumes per repetition. */
const ARITY: Record<string, number> = { m: 2, l: 2, c: 6, q: 4, z: 0 };

/**
 * Split path data into commands and numbers.
 *
 * Numbers are matched rather than split on separators because SVG allows both
 * `10-5` and `.5.5` — two numbers each, with no separator between them.
 */
const TOKEN = /([MmLlCcQqZz])|([+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?)|([,\s]+)/y;

/** Parse SVG path data into absolute segments, or say what stopped it. */
export function parseSvgPath(d: string): SvgPathResult {
  const source = d.trim();
  if (source === "") {
    return { ok: false, error: "path data is empty" };
  }

  const segments: PathSegment[] = [];
  // The current point, and the point a `Z` returns to.
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let started = false;

  TOKEN.lastIndex = 0;
  let command: string | null = null;
  let relative = false;
  let pending: number[] = [];

  /** Consume `pending` while it holds a full repetition of `command`. */
  const flush = (final: boolean): string | null => {
    if (command === null) {
      return pending.length > 0
        ? `path data starts with a number; expected one of ${SVG_PATH_COMMANDS}`
        : null;
    }
    const arity = ARITY[command]!;
    if (arity === 0) {
      if (!started) {
        return "`Z` closes a subpath that was never opened with `M`";
      }
      segments.push({ kind: "close" });
      cx = startX;
      cy = startY;
      command = null;
      return null;
    }
    while (pending.length >= arity) {
      const n = pending.splice(0, arity);
      const px = relative ? cx : 0;
      const py = relative ? cy : 0;
      if (command === "m") {
        const x = px + n[0]!;
        const y = py + n[1]!;
        segments.push({ kind: "move", x, y });
        startX = x;
        startY = y;
        cx = x;
        cy = y;
        started = true;
        // A second coordinate pair after `M` is an implicit `L` (SVG 1.1
        // §8.3.2), which is how most exporters write a polygon.
        command = "l";
        continue;
      }
      if (!started) {
        return `path data draws with \`${command.toUpperCase()}\` before any \`M\``;
      }
      if (command === "l") {
        cx = px + n[0]!;
        cy = py + n[1]!;
        segments.push({ kind: "line", x: cx, y: cy });
        continue;
      }
      if (command === "c") {
        const x1 = px + n[0]!;
        const y1 = py + n[1]!;
        const x2 = px + n[2]!;
        const y2 = py + n[3]!;
        cx = px + n[4]!;
        cy = py + n[5]!;
        segments.push({ kind: "cubic", x1, y1, x2, y2, x: cx, y: cy });
        continue;
      }
      const x1 = px + n[0]!;
      const y1 = py + n[1]!;
      cx = px + n[2]!;
      cy = py + n[3]!;
      segments.push({ kind: "quad", x1, y1, x: cx, y: cy });
    }
    if (final && pending.length > 0) {
      return `\`${command.toUpperCase()}\` takes ${arity} numbers per point; ${pending.length} left over`;
    }
    return null;
  };

  while (TOKEN.lastIndex < source.length) {
    // A failed sticky match resets `lastIndex`, so the offending character has
    // to be read before the call, not after it.
    const at = TOKEN.lastIndex;
    const match = TOKEN.exec(source);
    if (!match) {
      return {
        ok: false,
        error: `unexpected "${source[at]}" in path data; this build reads ${SVG_PATH_COMMANDS}`
      };
    }
    if (match[3] !== undefined) continue;
    if (match[2] !== undefined) {
      if (command === null) {
        return {
          ok: false,
          error: `path data starts with a number; expected one of ${SVG_PATH_COMMANDS}`
        };
      }
      pending.push(Number(match[2]));
      const error = flush(false);
      if (error) return { ok: false, error };
      continue;
    }
    const error = flush(true);
    if (error) return { ok: false, error };
    pending = [];
    const letter = match[1]!;
    command = letter.toLowerCase();
    relative = letter !== letter.toUpperCase();
    if (command === "z") {
      const closeError = flush(true);
      if (closeError) return { ok: false, error: closeError };
    }
  }
  const error = flush(true);
  if (error) return { ok: false, error };
  if (segments.length === 0) {
    return { ok: false, error: "path data draws nothing" };
  }
  return { ok: true, segments };
}

/** The Canvas 2D path calls {@link tracePath} issues. */
export interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(
    cp1x: number,
    cp1y: number,
    cp2x: number,
    cp2y: number,
    x: number,
    y: number
  ): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  closePath(): void;
}

/** How a path's own units map onto the surface it is traced on. */
export interface PathPlacement {
  scaleX: number;
  scaleY: number;
  offsetX?: number;
  offsetY?: number;
}

/**
 * Replay `segments` onto `sink`, scaled and offset by `placement`. The sink is
 * left with the path open — the caller decides whether to fill, stroke or clip
 * it, and with which fill rule.
 */
export function tracePath(
  sink: PathSink,
  segments: readonly PathSegment[],
  placement: PathPlacement
): void {
  const { scaleX, scaleY } = placement;
  const ox = placement.offsetX ?? 0;
  const oy = placement.offsetY ?? 0;
  const px = (v: number): number => ox + v * scaleX;
  const py = (v: number): number => oy + v * scaleY;
  for (const segment of segments) {
    switch (segment.kind) {
      case "move":
        sink.moveTo(px(segment.x), py(segment.y));
        break;
      case "line":
        sink.lineTo(px(segment.x), py(segment.y));
        break;
      case "cubic":
        sink.bezierCurveTo(
          px(segment.x1),
          py(segment.y1),
          px(segment.x2),
          py(segment.y2),
          px(segment.x),
          py(segment.y)
        );
        break;
      case "quad":
        sink.quadraticCurveTo(
          px(segment.x1),
          py(segment.y1),
          px(segment.x),
          py(segment.y)
        );
        break;
      case "close":
        sink.closePath();
        break;
    }
  }
}
