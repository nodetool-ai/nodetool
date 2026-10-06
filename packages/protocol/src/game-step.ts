export interface GameSystemTiming {
  readonly system: string;
  readonly durationMs: number;
}

/** Diagnostic wall-clock measurements, excluded from deterministic snapshots. */
export interface GameStepTimings {
  readonly systems: readonly GameSystemTiming[];
  readonly totalMs: number;
}
