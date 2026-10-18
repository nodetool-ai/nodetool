/** Measured wet return, after MIX and before the reverb headroom guard. */
export interface ReverbMessage {
  t: 'reverb';
  /** DR-1 identifies the selected pad and shared output bus. */
  pad?: number;
  bus?: number;
  shared?: boolean;
  left: number;
  right: number;
  correlation: number;
}

export const idleReverb = (): ReverbMessage => ({ t: 'reverb', left: -90, right: -90, correlation: 0 });
