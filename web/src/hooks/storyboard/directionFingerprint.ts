/**
 * What a Director run depends on, as one comparable string (PRD § 7.2, F15).
 *
 * The run records it on the board (`setupDirectedFrom`) and the genre step
 * compares it against the current inputs: equal means the screenplay already
 * answers them, so the step continues to it rather than paying for the same
 * answer twice. It lives beside the run rather than in the flow, because the
 * headless path runs the Director too and must record the same value.
 *
 * A missing or stale fingerprint only ever offers an explicit re-direct. It
 * can never cause a run the creator did not ask for, which is why a plain
 * string comparison is enough and no hash is needed.
 */

export interface DirectionInputs {
  brief: string;
  genre: string;
  shotCount: number;
  /** The model that writes it — a different writer is a different screenplay. */
  modelId: string;
  /** `fdx`, `text`, or `none`: an imported script is directed differently. */
  importKind: string;
}

export function directionFingerprint(input: DirectionInputs): string {
  return [
    input.brief.trim(),
    input.genre,
    String(input.shotCount),
    input.modelId,
    input.importKind
  ].join("␟");
}

export default directionFingerprint;
