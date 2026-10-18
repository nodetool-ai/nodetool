/**
 * Premiere's Enable (Shift+E): a disabled clip stays in the sequence but
 * neither draws nor sounds. A sound-only clip is disabled by `muted`; any
 * other clip by `hidden`, and disabling it also mutes its own audio so the
 * picture and its sound go quiet together.
 */

import type { TimelineClip } from "@nodetool-ai/timeline";

const isSoundOnly = (clip: Pick<TimelineClip, "mediaType">): boolean =>
  clip.mediaType === "audio" || clip.mediaType === "midi";

export function isClipDisabled(
  clip: Pick<TimelineClip, "mediaType" | "hidden" | "muted">
): boolean {
  return isSoundOnly(clip) ? clip.muted === true : clip.hidden === true;
}

/** The patch that enables or disables `clip`. */
export function clipEnabledPatch(
  clip: Pick<TimelineClip, "mediaType">,
  enabled: boolean
): Pick<TimelineClip, "hidden" | "muted"> {
  if (isSoundOnly(clip)) return { muted: !enabled };
  return { hidden: !enabled, muted: !enabled };
}
