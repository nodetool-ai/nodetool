import type { TimeMap } from "./types";

/** Shared frame-count math for the three-beat tutorial layout (see TutorialShell). */
interface TutorialTiming {
  introSeconds: number;
  outroSeconds: number;
  replayWindowMs: number;
}

export function validateTimeMap(timeMap: TimeMap): readonly string[] {
  const errors: string[] = [];
  timeMap.forEach((segment, index) => {
    if (segment.presentationFromMs < 0 || segment.castFromMs < 0) {
      errors.push(`timeMap[${index}] starts before zero`);
    }
    if (segment.presentationToMs <= segment.presentationFromMs) {
      errors.push(`timeMap[${index}] has an empty presentation interval`);
    }
    if (segment.castToMs < segment.castFromMs) {
      errors.push(`timeMap[${index}] moves cast time backward`);
    }
    const previous = timeMap[index - 1];
    if (previous && segment.presentationFromMs < previous.presentationToMs) {
      errors.push(`timeMap[${index}] overlaps or is unordered`);
    }
    if (previous && segment.castFromMs < previous.castToMs) {
      errors.push(`timeMap[${index}] starts before the previous cast interval ends`);
    }
  });
  return errors;
}

/** Pure mapping used for every frame, including direct and backward seeks. */
export function presentationToCastTime(
  presentationTimeMs: number,
  timeMap?: TimeMap
): number {
  const time = Math.max(0, presentationTimeMs);
  if (!timeMap || timeMap.length === 0) return time;
  const errors = validateTimeMap(timeMap);
  if (errors.length > 0) throw new Error(errors.join("; "));

  const first = timeMap[0];
  if (time <= first.presentationFromMs) {
    return Math.max(0, first.castFromMs - (first.presentationFromMs - time));
  }
  for (let index = 0; index < timeMap.length; index += 1) {
    const segment = timeMap[index];
    if (time <= segment.presentationToMs) {
      const progress =
        (time - segment.presentationFromMs) /
        (segment.presentationToMs - segment.presentationFromMs);
      return segment.castFromMs + progress * (segment.castToMs - segment.castFromMs);
    }
    const next = timeMap[index + 1];
    if (next && time < next.presentationFromMs) {
      const progress =
        (time - segment.presentationToMs) /
        (next.presentationFromMs - segment.presentationToMs);
      return segment.castToMs + progress * (next.castFromMs - segment.castToMs);
    }
  }
  const last = timeMap[timeMap.length - 1];
  return last.castToMs + (time - last.presentationToMs);
}

/** Total frames for a tutorial: intro + replay window + outro. */
export function framesForTiming(fps: number, timing: TutorialTiming): number {
  const seconds =
    timing.introSeconds + timing.replayWindowMs / 1000 + timing.outroSeconds;
  return Math.round(seconds * fps);
}
