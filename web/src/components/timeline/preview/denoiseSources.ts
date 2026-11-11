import type { TimelineClip } from "@nodetool-ai/timeline";
import { clipSourceTimeSec } from "@nodetool-ai/timeline/scene";
import { denoiseSourceTimes } from "@nodetool-ai/timeline/scene";

type Role = "before" | "after";
const sourceClips = new WeakMap<
  TimelineClip,
  { clip: TimelineClip; role: Role }
>();
export const isDenoiseSourceClip = (clip: TimelineClip): boolean =>
  sourceClips.has(clip);
export const denoiseSlotId = (id: string, role: Role): string =>
  `${id}#denoise-${role}`;
/** Ephemeral decoder slots keep the document's timing and own separate frame lifetimes. */
export function denoiseSourceClip(
  clip: TimelineClip,
  role: Role
): TimelineClip {
  const source = { ...clip, id: denoiseSlotId(clip.id, role) };
  sourceClips.set(source, { clip, role });
  return source;
}
export function previewClipSourceTimeSec(
  clip: TimelineClip,
  timeMs: number
): number {
  const temporal = sourceClips.get(clip);
  if (!temporal) return clipSourceTimeSec(clip, timeMs);
  return (
    denoiseSourceTimes(
      temporal.clip,
      clipSourceTimeSec(temporal.clip, timeMs) * 1000
    )[temporal.role] / 1000
  );
}
