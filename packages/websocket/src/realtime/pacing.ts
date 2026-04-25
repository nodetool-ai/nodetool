export interface PacingInput {
  nowMs: number;
  frameTimestampMs: number;
  lastEmitMs: number | null;
  minIntervalMs: number;
  maxFrameAgeMs: number;
}

export interface PacingDecision {
  emit: boolean;
  drop: boolean;
  frameAgeMs: number;
  waitMs: number;
}

export function computePacingDecision(input: PacingInput): PacingDecision {
  const frameAgeMs = Math.max(0, input.nowMs - input.frameTimestampMs);
  if (frameAgeMs > input.maxFrameAgeMs) {
    return {
      emit: false,
      drop: true,
      frameAgeMs,
      waitMs: 0
    };
  }

  const elapsedSinceEmit =
    input.lastEmitMs === null ? input.minIntervalMs : input.nowMs - input.lastEmitMs;
  const waitMs = Math.max(0, input.minIntervalMs - elapsedSinceEmit);

  return {
    emit: waitMs === 0,
    drop: false,
    frameAgeMs,
    waitMs
  };
}
