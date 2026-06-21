/**
 * useHasScript — whether the script feature (transcript lane + transcript
 * panel) is shown for the active timeline sequence.
 *
 * `scriptEnabled` is always a definite boolean post-normalization (the
 * back-compat fallback for legacy sequences is applied once in
 * `loadSequence`), so this selector is just the flag.
 */
import { useTimelineStore } from "../../stores/timeline/TimelineStore";

export function useHasScript(): boolean {
  return useTimelineStore((s) => s.scriptEnabled);
}
