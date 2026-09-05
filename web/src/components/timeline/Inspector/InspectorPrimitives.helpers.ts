/** Formats ms as HH:MM:SS:FF (frames) — used for the Start field. */
export function formatTimecode(ms: number, fps: number): string {
  const actualFps = Math.max(1, fps);
  const safeFps = Math.max(1, Math.round(fps));
  const totalFrames = Math.max(0, Math.round((ms / 1000) * actualFps));
  const ff = totalFrames % safeFps;
  const totalSec = Math.floor(totalFrames / safeFps);
  const ss = totalSec % 60;
  const mm = Math.floor(totalSec / 60) % 60;
  const hh = Math.floor(totalSec / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
}

/** Parses HH:MM:SS:FF (or M:SS, or plain ms) back into milliseconds. */
export function parseTimecode(input: string, fps: number): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const actualFps = Math.max(1, fps);
  const safeFps = Math.max(1, Math.round(fps));
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n);
  }
  const parts = trimmed.split(":").map((p) => p.trim());
  if (parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  let hh = 0;
  let mm = 0;
  let ss = 0;
  let ff = 0;
  if (nums.length === 4) {
    [hh, mm, ss, ff] = nums;
  } else if (nums.length === 3) {
    [hh, mm, ss] = nums;
  } else if (nums.length === 2) {
    [mm, ss] = nums;
  } else if (nums.length === 1) {
    [ss] = nums;
  } else {
    return null;
  }
  const totalSec = hh * 3600 + mm * 60 + ss;
  if (nums.length === 4) {
    // The displayed seconds/frames use the nominal integer FPS as their
    // timecode base, while the source timestamp uses the actual FPS.
    return Math.round(((totalSec * safeFps + ff) * 1000) / actualFps);
  }
  return Math.round(totalSec * 1000 + (ff * 1000) / actualFps);
}

/** "4.60s" → 4.6 seconds, returns ms. */
export function parseSeconds(input: string): number | null {
  const trimmed = input.trim().replace(/s$/i, "").trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1000);
}

// ── List-valued fields ──────────────────────────────────────────────────────
// Dash patterns, gradient stops and tone-curve points are arrays in the
// document and a single line of text in the inspector, so each one gets a
// parse/format pair here rather than an ad-hoc regex at the control.

/** "4, 2, 1" → [4, 2, 1]. Empty is an empty list; a non-number is `null`. */
export function parseNumberList(input: string): number[] | null {
  const trimmed = input.trim();
  if (trimmed === "") return [];
  const parts = trimmed.split(/[,\s]+/);
  const out: number[] = [];
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isFinite(n)) return null;
    out.push(n);
  }
  return out;
}

export function formatNumberList(values: readonly number[] | undefined): string {
  return (values ?? []).join(", ");
}

export interface ParsedGradientStop {
  offset: number;
  color: string;
}

/**
 * "0:#000000, 1:#ffffff" → two stops. Offsets are clamped to 0..1 and the
 * list is sorted, so a user typing them out of order still gets a legal
 * gradient. A stop missing its colour, or carrying a non-numeric offset, is
 * `null` — the caller leaves the document alone.
 */
export function parseGradientStops(input: string): ParsedGradientStop[] | null {
  const trimmed = input.trim();
  if (trimmed === "") return [];
  const out: ParsedGradientStop[] = [];
  for (const part of trimmed.split(",")) {
    const [rawOffset, ...rest] = part.split(":");
    const color = rest.join(":").trim();
    const offset = Number(rawOffset);
    if (!Number.isFinite(offset) || color === "") return null;
    out.push({ offset: Math.min(1, Math.max(0, offset)), color });
  }
  return out.sort((a, b) => a.offset - b.offset);
}

export function formatGradientStops(
  stops: readonly ParsedGradientStop[] | undefined
): string {
  return (stops ?? []).map((s) => `${s.offset}:${s.color}`).join(", ");
}

export interface ParsedCurvePoint {
  x: number;
  y: number;
}

/**
 * "0,0 0.5,0.6 1,1" → three tone-curve control points, clamped to the unit
 * square and sorted by x. A pair that is not `x,y` is `null`.
 */
export function parseCurvePoints(input: string): ParsedCurvePoint[] | null {
  const trimmed = input.trim();
  if (trimmed === "") return [];
  const out: ParsedCurvePoint[] = [];
  for (const pair of trimmed.split(/\s+/)) {
    const parts = pair.split(",");
    if (parts.length !== 2) return null;
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    out.push({ x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) });
  }
  return out.sort((a, b) => a.x - b.x);
}

export function formatCurvePoints(
  points: readonly ParsedCurvePoint[] | undefined
): string {
  return (points ?? []).map((p) => `${p.x},${p.y}`).join(" ");
}
