/**
 * Render a `model3d` clip's span to a Blockout reference video in the browser.
 *
 * The frames come from `computeModel3DReferenceFrames`, the list the server's
 * `render_model3d_reference` draws, and go through the same three.js render
 * session as the live preview, so a reference made here and one made by an
 * agent show the same picture. The session is created with
 * `model3dReferenceSession`: a fixed light and an opaque neutral background,
 * whatever the clip's own lighting and background are. Frames are encoded to
 * H.264 MP4 with mediabunny, the encoder the timeline export uses.
 */

import type { Model3DReferencePass, TimelineClip } from "@nodetool-ai/timeline";
import { model3dReferenceSession } from "@nodetool-ai/timeline";
import { computeModel3DReferenceFrames } from "@nodetool-ai/timeline/scene";
import { animationDurations, parseModel3D } from "@nodetool-ai/model3d";
import type {
  Model3DRenderSession,
  Model3DSessionOptions
} from "@nodetool-ai/video-nodes/nodes/model3d/render3d-core";

export interface BlockoutReferenceRenderOptions {
  clip: TimelineClip;
  sequence: { fps: number; width: number; height: number };
  pass: Model3DReferencePass;
  /** The clip's glTF, as bytes. */
  glb: Uint8Array;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  /** Overrides the lazily imported three.js session factory, for tests. */
  createSession?: (
    glb: Uint8Array,
    options: Model3DSessionOptions
  ) => Promise<Model3DRenderSession>;
}

export interface BlockoutReferenceVideo {
  bytes: Uint8Array;
  mimeType: "video/mp4";
  frames: number;
  width: number;
  height: number;
}

/** Frames encoded between yields to the event loop, so Cancel stays responsive. */
const FRAMES_PER_YIELD = 4;

const throwIfAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted) {
    throw new DOMException("The reference render was cancelled.", "AbortError");
  }
};

export async function renderBlockoutReference(
  options: BlockoutReferenceRenderOptions
): Promise<BlockoutReferenceVideo> {
  const { clip, sequence, pass, glb, signal, onProgress } = options;
  const style = clip.model3dStyle;
  if (clip.mediaType !== "model3d" || !style) {
    throw new Error(
      `Clip "${clip.name}" is not a 3D clip, so it has no reference to render.`
    );
  }
  throwIfAborted(signal);

  const durations = animationDurations(parseModel3D(glb).json);
  const frames = computeModel3DReferenceFrames(clip, sequence, durations, pass);
  const { width, height } = frames[0];
  const fps = Math.max(1, Math.round(sequence.fps));

  const [
    { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, canEncodeVideo },
    createSession
  ] = await Promise.all([
    import("mediabunny"),
    options.createSession
      ? Promise.resolve(options.createSession)
      : import("@nodetool-ai/video-nodes/nodes/model3d/render3d-core").then(
          (core) => core.createModel3DRenderSession
        )
  ]);
  if (!(await canEncodeVideo("avc", { width, height, bitrate: QUALITY_HIGH }))) {
    throw new Error(
      "This browser cannot encode H.264 video, so it cannot write the reference MP4."
    );
  }
  throwIfAborted(signal);

  const session = await createSession(glb, model3dReferenceSession(style));
  // The session draws into its own WebGL canvas. Each frame is copied to a
  // 2D canvas the encoder owns, so the encoder never reads a WebGL buffer
  // the next draw has already replaced.
  const frameCanvas = new OffscreenCanvas(width, height);
  const frameContext = frameCanvas.getContext("2d");
  if (!frameContext) {
    session.dispose();
    throw new Error("This browser has no 2D canvas to encode frames from.");
  }
  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget()
  });
  const source = new CanvasSource(frameCanvas, {
    codec: "avc",
    bitrate: QUALITY_HIGH
  });
  output.addVideoTrack(source, { frameRate: fps });
  try {
    await output.start();
    const frameDurationSec = 1 / fps;
    for (let index = 0; index < frames.length; index += 1) {
      throwIfAborted(signal);
      frameContext.drawImage(session.render(frames[index]), 0, 0, width, height);
      await source.add(index * frameDurationSec, frameDurationSec);
      onProgress?.(index + 1, frames.length);
      if ((index + 1) % FRAMES_PER_YIELD === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    await output.finalize();
  } finally {
    if (output.state === "started") {
      await output.cancel().catch(() => undefined);
    }
    session.dispose();
  }
  const buffer = output.target.buffer;
  if (!buffer) {
    throw new Error("Encoding the reference produced no output.");
  }
  return {
    bytes: new Uint8Array(buffer),
    mimeType: "video/mp4",
    frames: frames.length,
    width,
    height
  };
}
