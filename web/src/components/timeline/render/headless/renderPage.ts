/**
 * The page the server's `RenderTimeline` drives in headless Chromium.
 *
 * No editor and no React: it defines one global, `HEADLESS_RENDER_ENTRY`, that
 * runs {@link renderTimeline} — the exporter the editor's own Export button
 * uses, with the same compositor and scene model as the live preview — and
 * streams the result back to the loopback server that served the page. The
 * bundle is built into `@nodetool-ai/video-nodes` by
 * `packages/video-nodes/scripts/bundle-timeline-render-page.mjs`; the request
 * and the paths are `@nodetool-ai/timeline/render`'s `headlessRender.ts`.
 *
 * The page never holds the file: muxed chunks and PNG frames are POSTed as
 * they are produced, and each upload is awaited, so the server's disk write
 * is the backpressure.
 */

import { canEncodeVideo, QUALITY_HIGH, QUALITY_VERY_HIGH } from "mediabunny";
import {
  HEADLESS_RENDER_ENTRY,
  HEADLESS_RENDER_PATHS,
  HEADLESS_RENDER_PROGRESS,
  type HeadlessRenderEncoding,
  type HeadlessRenderProgress,
  type HeadlessRenderReport,
  type HeadlessRenderRequest
} from "@nodetool-ai/timeline/render";

import { renderTimeline, type RenderSink } from "../TimelineRenderer";

declare global {
  interface Window {
    [HEADLESS_RENDER_ENTRY]?: (
      request: HeadlessRenderRequest
    ) => Promise<HeadlessRenderReport>;
    [HEADLESS_RENDER_PROGRESS]?: (progress: HeadlessRenderProgress) => void;
  }
}

/** A path next to this page, so the server's per-render prefix is kept. */
function pageUrl(path: string, query: Record<string, string | number>): string {
  const url = new URL(path, window.location.href);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function upload(url: string, body: Uint8Array): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: body as BodyInit
  });
  if (!response.ok) {
    throw new Error(`Upload to ${url} failed: HTTP ${response.status}`);
  }
}

async function resolveUrl(assetId: string): Promise<string | undefined> {
  const response = await fetch(
    pageUrl(HEADLESS_RENDER_PATHS.resolve, { id: assetId })
  );
  if (!response.ok) return undefined;
  const { url } = (await response.json()) as { url?: unknown };
  return typeof url === "string" ? new URL(url, window.location.href).toString() : undefined;
}

/** The first encoding this browser can produce, in the driver's order. */
async function chooseEncoding(
  request: HeadlessRenderRequest
): Promise<HeadlessRenderEncoding> {
  for (const encoding of request.encodings) {
    if (encoding.kind === "png") return encoding;
    const options: Parameters<typeof canEncodeVideo>[1] = {
      width: request.width,
      height: request.height
    };
    if (request.alpha) options.alpha = "keep";
    const supported = await canEncodeVideo(encoding.codec, options).catch(() => false);
    if (supported) return encoding;
  }
  throw new Error(
    "This browser can encode none of the requested video codecs: " +
      request.encodings
        .map((encoding) => (encoding.kind === "png" ? "png" : encoding.codec))
        .join(", ")
  );
}

/** "vendor architecture" of the WebGPU adapter, for the render log. */
async function describeAdapter(): Promise<string | null> {
  if (!navigator.gpu) return null;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return null;
    const { vendor, architecture, description } = adapter.info;
    return [vendor, architecture, description].filter(Boolean).join(" ") || "unknown";
  } catch {
    return null;
  }
}

/**
 * Why a WebGPU canvas cannot be encoded here, or null when it can.
 *
 * The exporter encodes `new VideoFrame(canvas)`. Some headless setups (a
 * software Vulkan adapter on Linux) draw into the WebGPU canvas but read
 * back blank or garbage, which would encode a whole render of empty frames.
 * One cleared canvas, read back the way the encoder reads it, tells.
 */
async function webgpuReadbackFailure(): Promise<string | null> {
  if (!navigator.gpu) return null;
  let device: GPUDevice | undefined;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return null;
    device = await adapter.requestDevice();
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const context = canvas.getContext("webgpu");
    if (!context) return "the canvas has no WebGPU context";
    context.configure({
      device,
      format: navigator.gpu.getPreferredCanvasFormat(),
      alphaMode: "premultiplied"
    });
    const encoder = device.createCommandEncoder();
    encoder
      .beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            loadOp: "clear",
            storeOp: "store",
            clearValue: { r: 1, g: 0, b: 0, a: 1 }
          }
        ]
      })
      .end();
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    const frame = new VideoFrame(canvas, { timestamp: 0 });
    const probe = new OffscreenCanvas(16, 16);
    const probeContext = probe.getContext("2d");
    if (!probeContext) return "no 2D context to read the probe back";
    probeContext.drawImage(frame, 0, 0);
    frame.close();
    const [r, g, b, a] = probeContext.getImageData(8, 8, 1, 1).data;
    return r > 200 && g < 50 && b < 50 && a > 200
      ? null
      : `a red WebGPU canvas read back as rgba(${r}, ${g}, ${b}, ${a})`;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  } finally {
    device?.destroy();
  }
}

window[HEADLESS_RENDER_ENTRY] = async (request) => {
  const encoding = await chooseEncoding(request);
  const webgpuUnusable = await webgpuReadbackFailure();
  const sink: RenderSink = {
    write: (data, position) =>
      upload(pageUrl(HEADLESS_RENDER_PATHS.out, { position }), data),
    frame: (index, png) =>
      upload(pageUrl(HEADLESS_RENDER_PATHS.frame, { index }), png)
  };
  const intermediate = encoding.kind === "video" && encoding.intermediate === true;
  let frames = 0;
  const result = await renderTimeline({
    tracks: request.tracks,
    clips: request.clips,
    mediaTracks: request.mediaTracks,
    camera2d: request.camera2d,
    tempo: request.tempo,
    master: request.master,
    width: request.width,
    height: request.height,
    referenceWidth: request.referenceWidth,
    referenceHeight: request.referenceHeight,
    referenceFps: request.referenceFps,
    fps: request.fps,
    durationMs: request.durationMs,
    resolveUrl,
    format: encoding.kind === "png" ? "png_sequence" : encoding.container,
    videoCodec: encoding.kind === "video" ? encoding.codec : undefined,
    videoBitrate:
      request.bitrate > 0
        ? request.bitrate
        : intermediate
          ? QUALITY_VERY_HIGH
          : QUALITY_HIGH,
    alpha: request.alpha,
    motionBlur: request.motionBlur,
    webgpu: webgpuUnusable === null,
    includeAudio: false,
    sink,
    onProgress: (progress) => {
      frames = progress.frame;
      window[HEADLESS_RENDER_PROGRESS]?.({
        phase: progress.phase,
        frame: progress.frame,
        totalFrames: progress.totalFrames
      });
    }
  });
  return {
    backend: result.backend,
    // Asked after the render: an adapter requested beside the compositor's
    // own, then dropped, can take the compositor's device down with it.
    adapter: result.backend === "webgpu" ? await describeAdapter() : null,
    webgpuUnusable,
    encoding,
    frames,
    degradedBakes: result.degradations.length
  };
};
