/**
 * Track height helpers
 *
 * Shared constants and computation for track row height. When a track's
 * DSP chain editor is expanded inline the row grows by `FX_PANEL_HEIGHT_PX`
 * so the header (containing the editor) and the lane stay aligned.
 */

export const DEFAULT_TRACK_HEIGHT_PX = 64;
export const FX_PANEL_HEIGHT_PX = 280;


/** Default row height of a midi, audio or chord track in DAW mode. */
export const DAW_AUDIO_TRACK_HEIGHT_PX = 96;
/** Row height of a picture track (video, overlay, subtitle) in DAW mode. */
export const DAW_COLLAPSED_TRACK_HEIGHT_PX = 32;

const DAW_SOUND_TRACK_TYPES: ReadonlySet<string> = new Set(["midi", "audio", "chord"]);

/**
 * A track's row height before vertical zoom. DAW mode gives sound tracks a
 * taller default (a height the user set still wins) and collapses picture
 * tracks to a title strip.
 */
export function trackRowHeightPx(
  track: { type: string; heightPx?: number },
  dawMode = false
): number {
  if (!dawMode) return track.heightPx ?? DEFAULT_TRACK_HEIGHT_PX;
  if (DAW_SOUND_TRACK_TYPES.has(track.type)) {
    return track.heightPx ?? DAW_AUDIO_TRACK_HEIGHT_PX;
  }
  return DAW_COLLAPSED_TRACK_HEIGHT_PX;
}
