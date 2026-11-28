/**
 * Track height helpers
 *
 * Shared constants and computation for track row height. When a track's
 * DSP chain editor is expanded inline the row grows by `FX_PANEL_HEIGHT_PX`
 * so the header (containing the editor) and the lane stay aligned.
 */

export const DEFAULT_TRACK_HEIGHT_PX = 64;
export const FX_PANEL_HEIGHT_PX = 280;
/** The range a track row can be resized to. */
export const MIN_TRACK_HEIGHT_PX = 24;
export const MAX_TRACK_HEIGHT_PX = 300;

/** A track's stored height moved by `deltaPx`, kept within the resize range. */
export function steppedTrackHeightPx(track: { heightPx?: number }, deltaPx: number): number {
  return Math.min(
    MAX_TRACK_HEIGHT_PX,
    Math.max(MIN_TRACK_HEIGHT_PX, (track.heightPx ?? DEFAULT_TRACK_HEIGHT_PX) + deltaPx)
  );
}


/** Default row height of a midi, audio or chord track in DAW mode. */
export const DAW_AUDIO_TRACK_HEIGHT_PX = 64;
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

/** D65: below this header width the instrument selects become an icon menu
 *  and the effects button hides. */
export const TRACK_HEADER_FULL_CONTROLS_PX = 280;
/** D65: below this header width the lock button hides too. */
export const TRACK_HEADER_LOCK_MIN_PX = 220;
