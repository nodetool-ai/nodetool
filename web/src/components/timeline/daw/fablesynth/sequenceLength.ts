export const MIN_SEQUENCE_BARS = 1;
export const MAX_SEQUENCE_BARS = 4;

export function clampSequenceLength(length: number): number {
  return Math.min(MAX_SEQUENCE_BARS, Math.max(MIN_SEQUENCE_BARS, Math.round(length)));
}

export function sequenceChain(length: number): number[] {
  return Array.from({ length: clampSequenceLength(length) }, (_, index) => index);
}

export function sequenceLengthFromChain(chain: number[]): number {
  return clampSequenceLength(chain.length);
}
