export const DRUM_RHYTHM_VERSION = 1 as const;

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
    lanes: value.lanes.map((lane) => {
      if (!lane) return lane;
      const copy: NonNullable<typeof lane> = {
        enabled: lane.enabled,
        // Active POLY lanes always play bar one, including older saved rhythms.
        sourceBar: lane.enabled ? 0 : lane.sourceBar,
        steps: lane.steps,
        rotation: lane.rotation,
        timing: lane.timing.mode === 'grid' ? { mode: 'grid' } : { mode: 'fit', cycleBeats: lane.timing.cycleBeats },
      };
      if (lane.delayMs !== undefined) copy.delayMs = lane.delayMs;
      if (lane.stepDelayMs !== undefined) copy.stepDelayMs = [...lane.stepDelayMs];
      return copy;
    }),
  };
}
