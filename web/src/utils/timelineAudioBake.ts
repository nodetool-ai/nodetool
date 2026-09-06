/**
 * Client for `POST /api/timelines/:id/bake-audio-animation` — the door the
 * "Animate from audio" inspector panel knocks on.
 *
 * The measuring and the write both happen on the server (the
 * `bake_audio_animation` capability), so this only carries the settings there
 * and reports what came back. The body is snake_case because it is the
 * capability's own input names minus `timeline_id`, which the path carries.
 */
import { restFetch } from "../lib/rest-fetch";
import { isObjectLike } from "./typePredicates";

/** The clip properties an audio curve can drive. */
export const AUDIO_DRIVE_PROPERTIES = [
  "scale",
  "opacity",
  "offsetX",
  "offsetY"
] as const;
export type AudioDriveProperty = (typeof AUDIO_DRIVE_PROPERTIES)[number];

/** `envelope` follows loudness; `beats` puts a pulse on each onset. */
export const AUDIO_DRIVE_MODES = ["envelope", "beats"] as const;
export type AudioDriveMode = (typeof AUDIO_DRIVE_MODES)[number];

export interface BakeAudioAnimationBody {
  audio_clip_id: string;
  target_clip_id: string;
  property: AudioDriveProperty;
  /** `[quiet, loud]` — the values the curve runs between. */
  output_range: [number, number];
  mode: AudioDriveMode;
  /** Divides the top of the measured range; 1 uses the whole of it. */
  sensitivity?: number;
  attack_ms?: number;
  release_ms?: number;
  /** Shift along the timeline. Negative moves the motion earlier. */
  offset_ms?: number;
  /** Curve-simplification budget. The panel carries these through from an
   * earlier bake rather than exposing them, so a re-bake does not quietly
   * reset what an agent chose. */
  tolerance?: number;
  max_points?: number;
  frame_ms?: number;
  replace?: boolean;
}

export interface BakeAudioAnimationResult {
  timeline_id: string;
  updated_at: string;
  clip_id: string;
  property: string;
  mode: string;
  animationId?: string;
  keyframeCount: number;
  analyzed: { fromMs: number; toMs: number };
  /** True when the audio ran past the analysis budget and was cut short. */
  truncated: boolean;
  /** True when an earlier bake of the same property was overwritten. */
  replaced: boolean;
}

function isBakeAudioAnimationResult(
  data: unknown
): data is BakeAudioAnimationResult {
  return (
    isObjectLike(data) &&
    typeof (data as { updated_at?: unknown }).updated_at === "string" &&
    typeof (data as { keyframeCount?: unknown }).keyframeCount === "number"
  );
}

/** Bake one audio-driven curve onto a clip. Rejects with the server's message. */
export async function bakeAudioAnimation(
  timelineId: string,
  body: BakeAudioAnimationBody
): Promise<BakeAudioAnimationResult> {
  const res = await restFetch(
    `/api/timelines/${encodeURIComponent(timelineId)}/bake-audio-animation`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }
  );
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      isObjectLike(data) && "detail" in data
        ? String(data.detail)
        : `Bake failed (${res.status})`;
    throw new Error(detail);
  }
  if (!isBakeAudioAnimationResult(data)) {
    throw new Error("Unexpected response from the audio bake endpoint");
  }
  return data;
}
