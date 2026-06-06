import { sourceRate } from "./sourceRate.js";
import type { TimelineClip } from "./types.js";

export function trimClip(
  clip: TimelineClip,
  edge: "start" | "end",
  deltaMs: number,
  maxDurationMs?: number
): TimelineClip {
  const rate = sourceRate(clip);
  const inPointMs = clip.inPointMs ?? 0;
  const outPointMs = clip.outPointMs ?? inPointMs + clip.durationMs * rate;

  // `deltaMs` is a timeline delta; the source in/out points it reveals or hides
  // move by `deltaMs * rate` source-ms.
  const sourceDeltaMs = deltaMs * rate;
  const nextStartMs = edge === "start" ? clip.startMs - deltaMs : clip.startMs;
  const nextDurationMs = clip.durationMs + deltaMs;
  const nextInPointMs = edge === "start" ? inPointMs - sourceDeltaMs : inPointMs;
  const nextOutPointMs = edge === "end" ? outPointMs + sourceDeltaMs : outPointMs;

  if (nextDurationMs <= 0) {
    throw new Error("trimClip would result in a non-positive duration");
  }

  if (nextInPointMs < 0) {
    throw new Error("trimClip cannot extend before source start");
  }

  if (nextStartMs < 0) {
    throw new Error("trimClip cannot start before zero on the timeline");
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
