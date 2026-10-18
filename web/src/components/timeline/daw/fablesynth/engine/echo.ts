export interface EchoMessage {
  t: 'echo';
  /** Present for per-pad instruments; absent on WT-1. */
  pad?: number;
  input: number;
  left: number;
  right: number;
  time: number;
  driftL: number;
  driftR: number;
}

export const ECHO_DIVISIONS = [1, 1.5, 0.5, 0.75, 1 / 3, 0.25];
export const idleEcho = (time = 0.36): EchoMessage => ({
  t: 'echo', input: -90, left: -90, right: -90, time, driftL: 0, driftR: 0,
});
