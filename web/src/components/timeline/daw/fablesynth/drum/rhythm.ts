export const DRUM_RHYTHM_VERSION = 1 as const;
export const DRUM_RHYTHM_LANE_COUNT = 16;
export const DRUM_RHYTHM_MAX_STEPS = 16;

export type DrumLaneTiming = { mode: 'grid' } | { mode: 'fit'; cycleBeats: 4 | 8 };

export interface DrumLaneRhythm {
  enabled: boolean;
  sourceBar: number;
  steps: number;
  rotation: number;
  timing: DrumLaneTiming;
  delayMs?: number;
  /** Source-bar-major offsets, sixteen steps per bar. Omitted values are zero. */
  stepDelayMs?: number[];
}

export interface DrumRhythm {
  v: typeof DRUM_RHYTHM_VERSION;
  lanes: Array<DrumLaneRhythm | null>;
}

const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const int = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

export function validateDrumRhythm(value: unknown, sourceBars = 16): string | null {
  if (!record(value)) return 'rhythm must be an object';
  if (value.v !== 1) return `unknown rhythm version ${String(value.v)}`;
  if (!Array.isArray(value.lanes) || value.lanes.length !== 16) return 'rhythm: expected sixteen lanes';
  for (let i = 0; i < value.lanes.length; i++) {
    const lane = value.lanes[i];
    if (lane === null) continue;
    if (!record(lane)) return `rhythm lane ${i}: must be an object or null`;
    if (typeof lane.enabled !== 'boolean') return `rhythm lane ${i}: enabled must be boolean`;
    if (!int(lane.sourceBar, 0, sourceBars - 1)) return `rhythm lane ${i}: sourceBar out of range`;
    if (!int(lane.steps, 1, 16)) return `rhythm lane ${i}: steps out of range`;
    if (!int(lane.rotation, 0, lane.steps - 1)) return `rhythm lane ${i}: rotation out of range`;
    if (lane.delayMs !== undefined && !int(lane.delayMs, -50, 50)) return `rhythm lane ${i}: invalid delay`;
    if (lane.stepDelayMs !== undefined && (!Array.isArray(lane.stepDelayMs) || lane.stepDelayMs.length > 256
      || lane.stepDelayMs.some(v => !int(v, -50, 50)))) return `rhythm lane ${i}: invalid step delays`;
    if (!record(lane.timing)) return `rhythm lane ${i}: timing must be an object`;
    if (lane.timing.mode === 'grid') continue;
    if (lane.timing.mode !== 'fit' || (lane.timing.cycleBeats !== 4 && lane.timing.cycleBeats !== 8)) {
      return `rhythm lane ${i}: invalid timing mode/cycle`;
    }
  }
  return null;
}

export function cloneDrumRhythm(value: DrumRhythm | undefined, sourceBars = 16): DrumRhythm | undefined {
  if (value === undefined) return undefined;
  const error = validateDrumRhythm(value, sourceBars);
  if (error) throw new Error(`Invalid drum rhythm: ${error}`);
  return {
    v: 1,
    lanes: value.lanes.map((lane) => lane && {
      ...(lane.delayMs !== undefined ? { delayMs: lane.delayMs } : {}),
      ...(lane.stepDelayMs !== undefined ? { stepDelayMs: [...lane.stepDelayMs] } : {}),
      enabled: lane.enabled,
      // Active POLY lanes always play bar one, including older saved rhythms.
      sourceBar: lane.enabled ? 0 : lane.sourceBar,
      steps: lane.steps,
      rotation: lane.rotation,
      timing: lane.timing.mode === 'grid' ? { mode: 'grid' } : { mode: 'fit', cycleBeats: lane.timing.cycleBeats },
    }),
  };
}

export function assertDrumRhythm(value: unknown, sourceBars = 16): DrumRhythm {
  return cloneDrumRhythm(value as DrumRhythm, sourceBars)!;
}

export interface DrumSequence {
  patterns: Uint8Array;
  chain: number[];
  drumRhythm?: DrumRhythm;
}

export function defaultDrumLane(sourceBar = 0): DrumLaneRhythm {
  return { enabled: false, sourceBar, steps: 16, rotation: 0, timing: { mode: 'grid' } };
}

export function updateDrumLane(rhythm: DrumRhythm | undefined, pad: number,
  patch: Partial<DrumLaneRhythm>, sourceBar = 0, sourceBars = 4): DrumRhythm {
  if (!Number.isInteger(pad) || pad < 0 || pad >= 16) throw new Error('Invalid pad');
  const next = cloneDrumRhythm(rhythm, sourceBars) ?? { v: 1, lanes: Array(16).fill(null) };
  const lane = { ...(next.lanes[pad] ?? defaultDrumLane(sourceBar)), ...patch };
  if (lane.enabled) lane.sourceBar = 0;
  if (patch.steps !== undefined && Number.isInteger(lane.steps) && lane.steps > 0)
    lane.rotation %= lane.steps;
  next.lanes[pad] = lane;
  return cloneDrumRhythm(next, sourceBars)!;
}

export function drumSourceConflict(rhythm: DrumRhythm | undefined, bars: number, names?: string[]): string | null {
  const pad = rhythm?.lanes.findIndex(lane => lane !== null && lane.sourceBar >= bars) ?? -1;
  return pad < 0 ? null : `BAR ${rhythm!.lanes[pad]!.sourceBar + 1} is used by ${names?.[pad] ?? `PAD ${pad + 1}`}. Change its source before shortening.`;
}

export function cloneDrumSequence(value: DrumSequence, sourceBars = 4): DrumSequence {
  if (value.patterns.length !== 1024 || value.patterns.some(v => v > 2)) throw new Error('Invalid drum cells');
  if (!value.chain.length || value.chain.length > 4 || value.chain.some(v => !Number.isInteger(v) || v < 0 || v > 3))
    throw new Error('Invalid drum chain');
  return { patterns: value.patterns.slice(), chain: [...value.chain], drumRhythm: cloneDrumRhythm(value.drumRhythm, sourceBars) };
}

export function drumLaneBadge(lane: DrumLaneRhythm | null | undefined): string | null {
  if (!lane?.enabled) return null;
  return lane.timing.mode === 'grid' ? `GRID ${lane.steps}` : `FIT ${lane.steps}/${lane.timing.cycleBeats / 4}B`;
}

/** FIT's complete cycle, in playback order. Rotation moves the source notes,
 * not the clock. Fractions are exact cycle positions, never sixteenth rounding. */
export function drumFitSteps(lane: DrumLaneRhythm | null | undefined, editBar: number) {
  if (!lane?.enabled || lane.sourceBar !== editBar || lane.timing.mode !== 'fit') return null;
  const cycleBeats = lane.timing.cycleBeats;
  return Array.from({ length: lane.steps }, (_, slot) => ({
    sourceStep: (slot - lane.rotation + lane.steps) % lane.steps,
    phase: slot / lane.steps,
    beat: slot * cycleBeats / lane.steps,
    cycleBeats,
  }));
}
