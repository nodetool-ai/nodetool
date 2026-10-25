// Measurements at the WT-1 dynamics stages, before their downstream peak guards.
// Input/output are stereo RMS dBFS. Band levels are the OTT detectors; gains and
// compressor reduction are the wet dynamics action BEFORE automatic makeup.
export interface DynamicsMessage {
  t: 'dynamics';
  /** Present for per-pad instruments; absent on WT-1. */
  pad?: number;
  ott: { input: number; output: number; levels: number[]; gains: number[]; makeup: number };
  /** `trace` is the compressor's detector input (max |L|,|R|) for this block, one value per sample. */
  comp: { input: number; output: number; reduction: number; makeup: number; trace?: Float32Array };
  /**
   * Present from a limiter insert: input and output RMS, the peak gain
   * reduction in dB, and the sample peaks of the driven input and the output.
   */
  limiter?: { input: number; output: number; reduction: number; inputPeak: number; outputPeak: number };
}

export const idleDynamics = (): DynamicsMessage => ({
  t: 'dynamics',
  ott: { input: -90, output: -90, levels: [-90, -90, -90], gains: [0, 0, 0], makeup: 0 },
  comp: { input: -90, output: -90, reduction: 0, makeup: 0 },
});
