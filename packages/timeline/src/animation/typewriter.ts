import type { AnimationStagger } from "./types.js";

interface GraphemeSegmenter {
  segment(input: string): Iterable<{ segment: string }>;
}

const Segmenter = typeof Intl !== "undefined"
  ? (Intl as typeof Intl & {
      Segmenter?: new (
        locale: string | undefined,
        options: { granularity: "grapheme" }
      ) => GraphemeSegmenter;
    }).Segmenter
  : undefined;
const segmenter = Segmenter
  ? new Segmenter(undefined, { granularity: "grapheme" })
  : null;

export function countTypewriterUnits(text: string): number {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  return words.length - 1 + words.reduce(
    (count, word) => count + (segmenter
      ? Array.from(segmenter.segment(word)).length
      : Array.from(word).length),
    0
  );
}

/** Resolve the author-facing total duration to one-character reveal windows. */
export function typewriterTiming(
  text: string,
  clipDurationMs: number,
  requestedDurationMs?: number,
  stagger?: AnimationStagger
): { durationMs: number; stagger: AnimationStagger } {
  const count = countTypewriterUnits(text);
  const availableMs = Math.max(1, clipDurationMs);
  const totalMs = Math.min(
    availableMs,
    requestedDurationMs ?? (1 + Math.max(0, count - 1) * (stagger?.offsetMs ?? 65))
  );
  const fittedOffset = count > 1 ? Math.max(0.001, (totalMs - 1) / (count - 1)) : 0.001;
  const resolvedStagger: AnimationStagger = {
    unit: stagger?.unit ?? "character",
    offsetMs: stagger ? Math.min(stagger.offsetMs, fittedOffset) : fittedOffset
  };
  if (stagger?.from) resolvedStagger.from = stagger.from;
  return {
    durationMs: 1,
    stagger: resolvedStagger
  };
}
