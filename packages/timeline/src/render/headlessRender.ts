/**
 * The contract between the server's headless timeline render and the page it
 * drives in headless Chromium.
 *
 * `RenderTimeline` (`packages/video-nodes`) serves the page, its assets and an
 * upload endpoint from a loopback server, opens it with Playwright and calls
 * {@link HEADLESS_RENDER_ENTRY} with a {@link HeadlessRenderRequest}. The page
 * (`web/src/components/timeline/render/headless/renderPage.ts`) runs the
 * editor's own exporter, `renderTimeline`, and streams what it encodes back to
 * the paths below, relative to the page's own URL. Types only: both sides
 * build the values themselves.
 */

import type {
  MediaTrack,
  TimelineCamera2D,
  TimelineClip,
  TimelineMasterChannel,
  TimelineTempo,
  TimelineTrack
} from "../types.js";

/** The global the page defines and the driver calls. */
export const HEADLESS_RENDER_ENTRY = "__nodetoolRenderTimeline";

/** The function the driver exposes for progress reports. */
export const HEADLESS_RENDER_PROGRESS = "__nodetoolRenderProgress";

/** Paths the page reaches, relative to its own URL. */
export const HEADLESS_RENDER_PATHS = {
  /** `GET resolve?id=<asset id>` → `{ url }`, or 404 when unavailable. */
  resolve: "resolve",
  /** `POST out?position=<byte offset>` with a chunk of the muxed file. */
  out: "out",
  /** `POST frame?index=<frame>` with one PNG. */
  frame: "frame"
} as const;

/**
 * One encoding the page may produce. The driver lists them in preference
 * order and the page takes the first its WebCodecs can encode; `png` sends
 * frames instead of a container.
 */
export type HeadlessRenderEncoding =
  | {
      kind: "video";
      container: "mp4" | "webm";
      codec: "avc" | "vp9" | "av1";
      /** The server transcodes it again, so it is encoded with headroom. */
      intermediate?: boolean;
    }
  | { kind: "png" };

export interface HeadlessRenderRequest {
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  mediaTracks?: MediaTrack[];
  camera2d?: TimelineCamera2D | null;
  tempo?: TimelineTempo;
  master?: TimelineMasterChannel;
  /** Output size. */
  width: number;
  height: number;
  /** The sequence size layers are laid out in. */
  referenceWidth: number;
  referenceHeight: number;
  referenceFps?: number;
  fps: number;
  durationMs: number;
  alpha: boolean;
  /** Target video bitrate in bits per second; 0 lets the page choose. */
  bitrate: number;
  motionBlur: { samplesPerFrame: number; shutterAngle: number };
  encodings: HeadlessRenderEncoding[];
}

export interface HeadlessRenderProgress {
  phase: "preparing" | "audio" | "video" | "finalizing";
  frame: number;
  totalFrames: number;
}

export interface HeadlessRenderReport {
  /** The compositor that drew the frames. */
  backend: "webgpu" | "canvas2d";
  /** The WebGPU adapter, when the page had one: vendor and architecture. */
  adapter: string | null;
  /**
   * Why the page drew with Canvas 2D although it had WebGPU: the canvas it
   * draws on could not be read back for encoding. Null otherwise.
   */
  webgpuUnusable: string | null;
  /** The encoding the page chose from the request's list. */
  encoding: HeadlessRenderEncoding;
  frames: number;
  /** Baked 3D clips drawn from their live layer instead. */
  degradedBakes: number;
}
