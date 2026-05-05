import { createTimeOrderedUuid } from "./defaults.js";
import type { TimelineClip } from "./types.js";

export function splitClip(clip: TimelineClip, atMs: number): [TimelineClip, TimelineClip] {
  const clipEndMs = clip.startMs + clip.durationMs;
  if (atMs <= clip.startMs || atMs >= clipEndMs) {
    throw new Error("splitClip requires startMs < atMs < startMs + durationMs");
  }

  const leftDurationMs = atMs - clip.startMs;
  const rightDurationMs = clipEndMs - atMs;

  const inPointMs = clip.inPointMs ?? 0;
  const outPointMs = clip.outPointMs ?? inPointMs + clip.durationMs;

  // Intentionally shared: both split clips reference the same generation history metadata.
  // Regenerating one half creates a new version for that half only; it does not auto-regenerate the sibling.
  const sharedVersions = clip.versions;

  const leftClip: TimelineClip = {
    ...clip,
    id: createTimeOrderedUuid(),
    durationMs: leftDurationMs,
    inPointMs,
    outPointMs: inPointMs + leftDurationMs,
    versions: sharedVersions
  };

  const rightClip: TimelineClip = {
    ...clip,
    id: createTimeOrderedUuid(),
    startMs: atMs,
    durationMs: rightDurationMs,
    inPointMs: inPointMs + leftDurationMs,
    outPointMs,
    versions: sharedVersions
  };

  return [leftClip, rightClip];
}
