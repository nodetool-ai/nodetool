/**
 * Chord chart text: one cell per bar, "| Am | % F | C G | - |".
 *
 * A cell lists the chords that start in the bar. "%" means the chord from an
 * earlier bar still sounds at the bar start. "-" is a bar with no chord. The
 * chart is exact for chords that start on an even split of their bar.
 */

import { MIDI_PPQ } from "../midi/ticks.js";
import type { ChordQuality, TimelineChord, TimelineTempo } from "../types.js";
import { chordSymbol, parseChordSymbol } from "./chordSymbols.js";

/** Ticks in one bar of `tempo`. */
export function barTicks(tempo: Pick<TimelineTempo, "timeSignature">): number {
  const { beatsPerBar, beatUnit } = tempo.timeSignature;
  return Math.round(beatsPerBar * MIDI_PPQ * (4 / beatUnit));
}

/** The chart of `chords` from `startTick` to `endTick`, one cell per bar. */
export function chordChart(
  chords: ReadonlyArray<TimelineChord>,
  startTick: number,
  endTick: number,
  tempo: Pick<TimelineTempo, "timeSignature">
): string {
  const bar = barTicks(tempo);
  const count = Math.max(0, Math.ceil((endTick - startTick) / bar));
  if (count === 0) return "";
  const sorted = [...chords].sort((a, b) => a.startTick - b.startTick);
  const cells: string[] = [];
  for (let i = 0; i < count; i++) {
    const from = startTick + i * bar;
    const to = from + bar;
    const parts: string[] = [];
    if (sorted.some((c) => c.startTick < from && c.startTick + c.durationTick > from)) {
      parts.push("%");
    }
    for (const c of sorted) {
      if (c.startTick >= from && c.startTick < to) parts.push(chordSymbol(c));
    }
    cells.push(parts.length ? parts.join(" ") : "-");
  }
  return `| ${cells.join(" | ")} |`;
}

/** What the error messages show, so an agent can fix a chart in one try. */
export const CHORD_CHART_HELP =
  'Chart grammar: "|" separates bars. The chords in one bar split it evenly. ' +
  '"%" holds the previous chord over its slot. "-" is a slot with no chord. ' +
  'Example: "| Am | F | C G | % |".';

export type ParsedChordChart =
  | { ok: true; chords: TimelineChord[]; bars: number }
  | { ok: false; error: string };

/** The chords of a chart that starts at `startTick` (the inverse of `chordChart`). */
export function parseChordChart(
  text: string,
  startTick: number,
  tempo: Pick<TimelineTempo, "timeSignature">,
  mintId: (index: number) => string = (i) => `chord-${i}`
): ParsedChordChart {
  const fail = (why: string): ParsedChordChart => ({
    ok: false,
    error: `Cannot read the chord chart: ${why} ${CHORD_CHART_HELP}`
  });
  const cells = text.split("|").map((c) => c.trim());
  // A leading or trailing "|" leaves an empty edge cell.
  if (cells[0] === "") cells.shift();
  if (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
  if (cells.length === 0) return fail("the chart has no bars.");
  const bar = barTicks(tempo);
  const chords: TimelineChord[] = [];
  let last: TimelineChord | null = null;
  for (let b = 0; b < cells.length; b++) {
    const items = cells[b].split(/\s+/).filter((s) => s !== "");
    if (items.length === 0) {
      return fail(`bar ${b + 1} is empty. Write "-" for a bar with no chord.`);
    }
    const from = startTick + b * bar;
    for (let i = 0; i < items.length; i++) {
      const slotStart = from + Math.round((i * bar) / items.length);
      const slotEnd = from + Math.round(((i + 1) * bar) / items.length);
      const item = items[i];
      if (slotEnd <= slotStart) {
        return fail(`bar ${b + 1} holds ${items.length} items, more than the ${bar} ticks of a bar. Write fewer.`);
      }
      if (item === "-") {
        last = null;
      } else if (item === "%") {
        if (!last) {
          return fail(`"%" in bar ${b + 1} has no chord before it to hold.`);
        }
        last.durationTick = slotEnd - last.startTick;
      } else {
        const parsed = parseChordSymbol(item);
        if (!parsed.ok) return fail(`bar ${b + 1}, "${item}": ${parsed.error}`);
        last = {
          id: mintId(chords.length),
          startTick: slotStart,
          durationTick: slotEnd - slotStart,
          root: parsed.root,
          quality: parsed.quality as ChordQuality,
          inversion: parsed.inversion
        };
        chords.push(last);
      }
    }
  }
  return { ok: true, chords, bars: cells.length };
}
