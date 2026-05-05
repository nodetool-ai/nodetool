import type { TimelineClip } from "./types.js";

export function trimClip(
  clip: TimelineClip,
  edge: "start" | "end",
  deltaMs: number,
  maxDurationMs?: number
): TimelineClip {
  const inPointMs = clip.inPointMs ?? 0;
  const outPointMs = clip.outPointMs ?? inPointMs + clip.durationMs;

  const nextStartMs = edge === "start" ? clip.startMs - deltaMs : clip.startMs;
  const nextDurationMs = clip.durationMs + deltaMs;
  const nextInPointMs = edge === "start" ? inPointMs - deltaMs : inPointMs;
  const nextOutPointMs = edge === "end" ? outPointMs + deltaMs : outPointMs;

  if (nextDurationMs <= 0) {
    throw new Error("trimClip would result in a non-positive duration");
  }

  if (nextInPointMs < 0) {
    throw new Error("trimClip cannot extend before source start");
  }

  if (maxDurationMs !== undefined && nextOutPointMs > maxDurationMs) {
    throw new Error("trimClip cannot extend beyond source out-point");
  }

  return {
    ...clip,
    startMs: nextStartMs,
    durationMs: nextDurationMs,
    inPointMs: nextInPointMs,
    outPointMs: nextOutPointMs
  };
}
