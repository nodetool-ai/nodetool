/**
 * Bar positions on clip ops (D49). `atBar` (1-based) plus an optional `beat`
 * (1-based) resolve to timeline ms through the tempo map, the same grid the
 * chord ops and the ruler read.
 */

import { barStartMs, beatDurationMs } from "../midi/grid.js";
import { resolveTempo } from "../midi/tempo.js";
import type { BarTimeArgs } from "./op.js";
import type { TimelineOpState } from "./types.js";

/**
 * The ms a bar position names, or `ms` when the caller gave the ms form.
 * Throws when both forms are given, when `beat` has no `atBar`, or when a
 * value is not a whole bar / a beat of at least 1.
 */
export function resolveBarTime(
  state: Pick<TimelineOpState, "tempo">,
  args: BarTimeArgs,
  ms: number | undefined,
  msName: string
): number | undefined {
  const { atBar, beat } = args;
  if (atBar === undefined) {
    if (beat !== undefined) {
      throw new Error("`beat` needs `atBar`. Send both, or send the ms form.");
    }
    return ms;
  }
  if (ms !== undefined) {
    throw new Error(
      `Send \`${msName}\` or \`atBar\`, not both. They name the same time.`
    );
  }
  if (!Number.isInteger(atBar) || atBar < 1) {
    throw new Error(`atBar must be a whole bar number from 1. Got ${atBar}.`);
  }
  if (beat !== undefined && (!Number.isFinite(beat) || beat < 1)) {
    throw new Error(`beat must be 1 or more. Got ${beat}.`);
  }
  const tempo = resolveTempo(state);
  return barStartMs(atBar, tempo) + ((beat ?? 1) - 1) * beatDurationMs(tempo);
}
