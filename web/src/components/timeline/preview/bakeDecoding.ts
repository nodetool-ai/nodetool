/**
 * Whether this browser can actually play a `model3d` clip's transparent bake
 * (design §D6 output format, §R6).
 *
 * An alpha bake is WebM VP9 `yuva420p`. Chromium and Firefox decode it;
 * Safari decodes the video and throws the alpha away, which would draw an
 * opaque box over the footage the clip was made to sit on — a worse picture
 * than the live 3D proxy the clip drew before it was baked. So both browser
 * hosts probe the bake once: a video element that errors, or a first frame
 * whose pixels are all opaque, is `bake_undecodable`, and from then on the
 * clip's bake hash never matches and the scene model emits the live layer.
 *
 * Only a *transparent* bake is probed. An opaque one has no alpha to lose, and
 * a decode it fails is already an empty layer rather than a wrong one.
 */

import type { TimelineClip } from "@nodetool-ai/timeline";

/** Why a bake cannot be played here. */
export type BakeUndecodableReason =
  /** The video element refused the file, or decoded nothing from it. */
  | "decode_error"
  /** It decoded, and every pixel of its first frame came back opaque. */
  | "no_alpha";

/** A `model3d` clip's stored bake, and the asset that holds it. */
export interface AlphaBake {
  clipId: string;
  assetId: string;
}

export interface BakeUndecodable extends AlphaBake {
  reason: BakeUndecodableReason;
}

/** Alpha at or above this is opaque; a `yuva420p` decode is not exact. */
const OPAQUE_ALPHA = 250;

/** Longest edge of the surface the first frame is read back through. */
const PROBE_SIZE = 64;

/**
 * The transparent bakes a document would play: a `model3d` clip with a
 * transparent style whose stored bake still matches the live document. A stale
 * bake is not probed because nothing plays it.
 */
export function alphaBakesToProbe(
  clips: readonly TimelineClip[],
  bakeHash: (clip: TimelineClip) => string
): AlphaBake[] {
  const bakes: AlphaBake[] = [];
  for (const clip of clips) {
    const style = clip.model3dStyle;
    const bake = style?.bake;
    if (!style || !bake || !style.background.transparent) continue;
    if (bakeHash(clip) !== bake.dependencyHash) continue;
    bakes.push({ clipId: clip.id, assetId: bake.assetId });
  }
  return bakes;
}

/**
 * Wrap a bake-hash resolver so an undecodable bake never matches its clip.
 *
 * The scene model already treats "no hash" as "play the live layer" (a host
 * that supplies no resolver at all gets the same answer), so this is the whole
 * fallback: the video layer is never emitted, the 3D session draws instead,
 * and the caller reports what it swapped.
 */
export function guardBakeHash(
  bakeHash: (clip: TimelineClip) => string,
  undecodable: readonly BakeUndecodable[]
): (clip: TimelineClip) => string | undefined {
  return (clip) => {
    const assetId = clip.model3dStyle?.bake?.assetId;
    if (assetId !== undefined && undecodable.some((b) => b.assetId === assetId)) {
      return undefined;
    }
    return bakeHash(clip);
  };
}

/**
 * Read the element's current frame and say whether any of it is transparent.
 *
 * Drawn into a cleared canvas, so a decoder that kept the alpha channel leaves
 * the ground showing through and one that composited the video over black does
 * not. A surface that cannot be read at all answers "has alpha": the claim
 * this makes is that the bake is *unplayable*, and a canvas this browser will
 * not give up is no evidence of that.
 */
function firstFrameHasAlpha(video: HTMLVideoElement): boolean {
  const width = Math.max(1, Math.min(PROBE_SIZE, video.videoWidth));
  const height = Math.max(
    1,
    Math.round((width * video.videoHeight) / Math.max(1, video.videoWidth))
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return true;
  ctx.clearRect(0, 0, width, height);
  try {
    ctx.drawImage(video, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    for (let i = 3; i < data.length; i += 4) {
      if ((data[i] ?? 255) < OPAQUE_ALPHA) return true;
    }
  } catch {
    // A tainted or unreadable surface says nothing about the file.
    return true;
  }
  return false;
}

/**
 * Load a bake's first frame and report why it cannot be played, or null when
 * it can. One probe per asset is enough — the answer is a property of this
 * browser and that file.
 */
export async function probeAlphaBake(
  url: string,
  signal?: AbortSignal
): Promise<BakeUndecodableReason | null> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";
  try {
    await new Promise<void>((resolve, reject) => {
      const done = (fn: () => void) => () => {
        video.removeEventListener("loadeddata", onLoaded);
        video.removeEventListener("error", onError);
        signal?.removeEventListener("abort", onAbort);
        fn();
      };
      const onLoaded = done(resolve);
      const onError = done(() =>
        reject(new Error(`The bake at ${url} could not be decoded.`))
      );
      const onAbort = done(() =>
        reject(new DOMException("Probe aborted", "AbortError"))
      );
      video.addEventListener("loadeddata", onLoaded);
      video.addEventListener("error", onError);
      signal?.addEventListener("abort", onAbort);
      video.src = url;
      video.load();
    });
    if (video.videoWidth === 0) return "decode_error";
    return firstFrameHasAlpha(video) ? null : "no_alpha";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return "decode_error";
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}
