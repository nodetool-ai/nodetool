/** Web melodic POLY prototype. One clock plays the first N cells of bar one. */
export interface SequenceRhythm {
  v: 1;
  enabled: boolean;
  mode: 'grid' | 'fit';
  steps: number;
  rotation: number;
  cycleBeats: 4 | 8;
}
export const defaultSequenceRhythm = (): SequenceRhythm => ({
  v: 1, enabled: false, mode: 'grid', steps: 16, rotation: 0, cycleBeats: 4,
});
export function validSequenceRhythm(value: unknown): value is SequenceRhythm {
  if (!value || typeof value !== 'object') return false;
  const r = value as SequenceRhythm;
  return r.v === 1 && typeof r.enabled === 'boolean' && (r.mode === 'grid' || r.mode === 'fit')
    && Number.isInteger(r.steps) && r.steps >= 1 && r.steps <= 16
    && Number.isInteger(r.rotation) && r.rotation >= 0 && r.rotation < r.steps
    && (r.cycleBeats === 4 || r.cycleBeats === 8);
}
export function copySequenceRhythm(value?: SequenceRhythm): SequenceRhythm {
  return validSequenceRhythm(value) ? { ...value } : defaultSequenceRhythm();
}
export function updateSequenceRhythm(value: SequenceRhythm, patch: Partial<SequenceRhythm>): SequenceRhythm {
  const next = { ...value, ...patch };
  if (Number.isInteger(next.steps) && next.steps > 0) next.rotation %= next.steps;
  if (!validSequenceRhythm(next)) throw new Error('Invalid sequence rhythm');
  return next;
}
