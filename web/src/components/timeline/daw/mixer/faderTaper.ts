/**
 * The mixer's decibel scale: where a level sits on a fader's travel and on a
 * meter, and how it reads as text. One taper serves both so a meter's 0 dB
 * line lines up with the fader's 0 dB mark.
 */

import type { FaderMark } from "../../../ui_primitives";

/** The fader's top. The document allows more; typing a value reaches it. */
export const FADER_MAX_DB = 6;
/** The schema's floor, written when the fader is pulled to the bottom. */
export const FADER_MIN_DB = -120;
/** The document's ceiling, the most a typed value may set. */
export const MIXER_MAX_DB = 24;

/** Breakpoints of the taper: travel position (0..1) against decibels. */
const TAPER: ReadonlyArray<readonly [number, number]> = [
  [0, FADER_MIN_DB],
  [0.04, -72],
  [0.12, -48],
  [0.25, -30],
  [0.42, -18],
  [0.6, -9],
  [0.78, -3],
  [0.86, 0],
  [1, FADER_MAX_DB]
];

/** Travel position of a level, 0 at the bottom and 1 at the top. */
export function dbToFaderPosition(db: number): number {
  if (!Number.isFinite(db) || db <= FADER_MIN_DB) return 0;
  if (db >= FADER_MAX_DB) return 1;
  for (let i = 1; i < TAPER.length; i += 1) {
    const [p1, d1] = TAPER[i];
    if (db <= d1) {
      const [p0, d0] = TAPER[i - 1];
      return p0 + ((db - d0) / (d1 - d0)) * (p1 - p0);
    }
  }
  return 1;
}

/** The level at a travel position, rounded to 0.1 dB. */
export function faderPositionToDb(position: number): number {
  if (!(position > 0)) return FADER_MIN_DB;
  if (position >= 1) return FADER_MAX_DB;
  for (let i = 1; i < TAPER.length; i += 1) {
    const [p1, d1] = TAPER[i];
    if (position <= p1) {
      const [p0, d0] = TAPER[i - 1];
      const db = d0 + ((position - p0) / (p1 - p0)) * (d1 - d0);
      return Math.round(db * 10) / 10;
    }
  }
  return FADER_MAX_DB;
}

/** "-6.0 dB", "+3.5 dB", "-inf dB" at the floor. */
export function formatDb(db: number | undefined): string {
  const value = db ?? 0;
  if (value <= FADER_MIN_DB) return "-inf dB";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)} dB`;
}

/**
 * Read a typed level: "-6", "-6 dB", "+3.5db", "inf"/"-inf" for silence.
 * Null when the text is not a level. Clamped to the document's range.
 */
export function parseDb(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s*db$/, "").replace("−", "-");
  if (t === "-inf" || t === "inf" || t === "-∞" || t === "∞") return FADER_MIN_DB;
  if (t === "") return null;
  const value = Number(t);
  if (!Number.isFinite(value)) return null;
  return Math.min(MIXER_MAX_DB, Math.max(FADER_MIN_DB, value));
}

/** "C", "L 30", "R 100", spoken as "centre", "30% left". */
export function formatPan(pan: number | undefined): string {
  const amount = Math.round(Math.abs(pan ?? 0) * 100);
  if (amount === 0) return "C";
  return `${(pan ?? 0) < 0 ? "L" : "R"} ${amount}`;
}

export function panValueText(pan: number): string {
  const amount = Math.round(Math.abs(pan) * 100);
  if (amount === 0) return "Centre";
  return `${amount}% ${pan < 0 ? "left" : "right"}`;
}

/** The scale printed beside every fader and meter. */
export const FADER_MARKS: readonly FaderMark[] = [
  { value: 6, label: "+6" },
  { value: 0, label: "0" },
  { value: -6, label: "-6" },
  { value: -12, label: "-12" },
  { value: -24, label: "-24" },
  { value: -48, label: "-48" },
  { value: FADER_MIN_DB, label: "∞" }
];
