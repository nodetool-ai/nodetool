/**
 * The decode rules the timeline preview and the export share: which tracks
 * WebCodecs may decode, which frame belongs to a time, and when a sequential
 * decode must restart. `SequentialVideoSource` (export) and
 * `DecodedFrameSource` (preview) both use them, so the two paths select the
 * same frame for the same time.
 */
import {
  ALL_FORMATS,
  Input,
  UrlSource,
  VideoSampleSink,
  type InputVideoTrack
} from "mediabunny";

/**
 * Largest forward step that decodes through instead of restarting at the
 * preceding keyframe.
 */
export const MAX_SEQUENTIAL_GAP_SEC = 1;

/**
 * Slack when matching a requested time to a container timestamp. Frame times
 * are computed in floating point and can land an ulp below the timestamp of
 * the frame they mean, which would repeat the previous frame and then skip.
 */
export const TIMESTAMP_EPSILON_SEC = 0.000001;

/** Whether a frame starting at `frameSec` may be drawn for `targetSec`. */
export function frameStartsBy(frameSec: number, targetSec: number): boolean {
  return frameSec <= targetSec + TIMESTAMP_EPSILON_SEC;
}

/**
 * The index of the last frame that starts at or before `targetSec`, or -1.
 * `timestamps` is in presentation order.
 */
export function selectFrameIndex(
  timestamps: readonly number[],
  targetSec: number
): number {
  let index = -1;
  for (let i = 0; i < timestamps.length; i += 1) {
    if (!frameStartsBy(timestamps[i], targetSec)) break;
    index = i;
  }
  return index;
}

/**
 * Whether a sequential decode at `positionSec` must restart to reach
 * `targetSec`: a step backward, or a jump forward past
 * {@link MAX_SEQUENTIAL_GAP_SEC}.
 */
export function needsDecodeRestart(positionSec: number, targetSec: number): boolean {
  return (
    targetSec < positionSec - TIMESTAMP_EPSILON_SEC ||
    targetSec - positionSec > MAX_SEQUENTIAL_GAP_SEC
  );
}

/** The track properties that decide whether WebCodecs may decode a clip. */
export interface DecodableTrackFacts {
  rotation: number;
  pixelAspect: { num: number; den: number };
  transparent: boolean;
  hdr: boolean;
}

/**
 * Why a track must stay on the `<video>` path, or null when it may decode.
 * A frame from a `VideoFrame` does not apply container transforms, and the
 * GPU upload has no alpha plane or HDR conversion.
 */
export function decodeRejection(facts: DecodableTrackFacts): string | null {
  if (facts.rotation !== 0) return "rotation";
  if (facts.pixelAspect.num !== facts.pixelAspect.den) return "pixel-aspect";
  if (facts.transparent) return "alpha";
  if (facts.hdr) return "hdr";
  return null;
}

/** An opened, decodable video track. The caller disposes `input`. */
export interface OpenedVideoTrack {
  input: Input;
  track: InputVideoTrack;
  width: number;
  height: number;
  createSink: (preferSoftware: boolean) => VideoSampleSink;
}

export type OpenVideoTrackResult =
  | { ok: true; opened: OpenedVideoTrack }
  | { ok: false; reason: string };

function abortError(): DOMException {
  return new DOMException("Video decode aborted", "AbortError");
}

/**
 * Open a URL's primary video track for WebCodecs, or report why the clip
 * stays on the `<video>` path. Throws only for an abort or a network failure.
 */
export async function openDecodableVideoTrack(
  url: string,
  signal?: AbortSignal
): Promise<OpenVideoTrackResult> {
  if (signal?.aborted) throw abortError();
  if (typeof VideoDecoder === "undefined") {
    return { ok: false, reason: "no-video-decoder" };
  }
  const input = new Input({
    source: new UrlSource(url, { maxCacheSize: 16 * 1024 * 1024, parallelism: 1 }),
    formats: ALL_FORMATS
  });
  const onAbort = () => input.dispose();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const track = await input.getPrimaryVideoTrack();
    const config = await track?.getDecoderConfig();
    if (!track || !config) {
      input.dispose();
      return { ok: false, reason: "no-video-track" };
    }
    if (!(await VideoDecoder.isConfigSupported(config)).supported) {
      input.dispose();
      return { ok: false, reason: "unsupported-codec" };
    }
    const [rotation, pixelAspect, transparent, hdr] = await Promise.all([
      track.getRotation(),
      track.getPixelAspectRatio(),
      track.canBeTransparent(),
      track.hasHighDynamicRange()
    ]);
    const rejection = decodeRejection({ rotation, pixelAspect, transparent, hdr });
    if (rejection) {
      input.dispose();
      return { ok: false, reason: rejection };
    }
    if (signal?.aborted) throw abortError();
    const [width, height] = await Promise.all([
      track.getDisplayWidth(),
      track.getDisplayHeight()
    ]);
    return {
      ok: true,
      opened: {
        input,
        track,
        width,
        height,
        createSink: (preferSoftware) =>
          new VideoSampleSink(
            track,
            preferSoftware ? { hardwareAcceleration: "prefer-software" } : undefined
          )
      }
    };
  } catch (error) {
    input.dispose();
    if (signal?.aborted) throw abortError();
    throw error;
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}
