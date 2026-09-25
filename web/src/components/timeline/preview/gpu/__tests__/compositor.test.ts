import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest
} from "@jest/globals";
import { stub } from "../../../../../test-utils/doubles";

const blit = jest.fn();
const composite = jest.fn(() => ({ texture: {}, drawn: 1 }));
/** Every `GpuFrameCompositor` constructor call, so a test can drive `upload`. */
const constructions: unknown[][] = [];

jest.mock("@nodetool-ai/timeline/render", () => ({
  GpuFrameCompositor: jest.fn().mockImplementation((...args: unknown[]) => {
    constructions.push(args);
    return {
      composite,
      blit,
      resize: jest.fn(),
      setReferenceSize: jest.fn(),
      dispose: jest.fn()
    };
  })
}));

import type { CompositeSource } from "../types";
import { WebGPUCompositor } from "../compositor";
import { expectPreviewVideoFrame, previewVideoFrameGeneration, trackPreviewVideoFrames } from "../videoFrameVersion";

/** How the shared core asks this backend for a layer's texture. */
type UploadSource = (
  id: string,
  source: CompositeSource
) => { texture: unknown } | null;

/** The `upload` callback the compositor handed the core it just built. */
function lastUpload(): UploadSource {
  const options = constructions[constructions.length - 1]?.[3];
  return (options as { upload: UploadSource }).upload;
}

interface FakeGpu {
  events: EventTarget;
  device: GPUDevice;
  context: GPUCanvasContext;
  canvas: HTMLCanvasElement;
  configure: jest.Mock<(configuration: GPUCanvasConfiguration) => undefined>;
  copyExternalImageToTexture: jest.Mock<GPUQueue["copyExternalImageToTexture"]>;
}

/**
 * A WebGPU surface that records `configure` calls and hands out devices in
 * order, so a test can tell which device claimed the canvas and when.
 */
function fakeGpu(
  lost: Promise<GPUDeviceLostInfo> = new Promise(() => {})
): FakeGpu {
  const configure =
    jest.fn<(configuration: GPUCanvasConfiguration) => undefined>();
  const copyExternalImageToTexture =
    jest.fn<GPUQueue["copyExternalImageToTexture"]>();
  const events = new EventTarget();
  const device = stub<GPUDevice>({
    lost,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    createCommandEncoder: () =>
      stub<GPUCommandEncoder>({ finish: () => stub<GPUCommandBuffer>({}) }),
    createTexture: () => stub<GPUTexture>({ destroy() {} }),
    queue: stub<GPUQueue>({ submit() {}, copyExternalImageToTexture }),
    destroy() {}
  });
  const context = stub<GPUCanvasContext>({
    configure,
    getCurrentTexture: () =>
      stub<GPUTexture>({ createView: () => stub<GPUTextureView>({}) })
  });
  // SAFETY: `getContext` is overloaded over every context id; this canvas
  // answers "webgpu" only, which is all the compositor asks for.
  const getContext = ((type: string) =>
    type === "webgpu" ? context : null) as HTMLCanvasElement["getContext"];
  const canvas = stub<HTMLCanvasElement>({
    width: 320,
    height: 180,
    getContext
  });
  Object.defineProperty(navigator, "gpu", {
    configurable: true,
    value: {
      requestAdapter: async () => ({ requestDevice: async () => device }),
      getPreferredCanvasFormat: () => "bgra8unorm"
    }
  });
  // jsdom has no WebGPU globals, and a source upload reads the usage flags.
  Object.defineProperty(globalThis, "GPUTextureUsage", {
    configurable: true,
    value: {
      TEXTURE_BINDING: 1,
      COPY_DST: 2,
      COPY_SRC: 4,
      RENDER_ATTACHMENT: 8
    }
  });
  return {
    events,
    device,
    context,
    canvas,
    configure,
    copyExternalImageToTexture
  };
}

describe("WebGPUCompositor", () => {
  const originalGpu = (navigator as { gpu?: unknown }).gpu;

  beforeEach(() => {
    blit.mockClear();
    composite.mockClear();
    constructions.length = 0;
  });

  afterEach(() => {
    Object.defineProperty(navigator, "gpu", {
      value: originalGpu,
      configurable: true
    });
    delete window.__nodetoolTimelinePerf;
    Reflect.deleteProperty(globalThis, "GPUTextureUsage");
  });

  it("claims the canvas on the first present, not in init", async () => {
    // React StrictMode mounts the preview twice, so two instances race
    // `init` on one canvas. The one that never renders must never configure
    // the context, or the survivor blits into a texture of a destroyed device.
    const gpu = fakeGpu();
    const loser = new WebGPUCompositor();
    const survivor = new WebGPUCompositor();
    await loser.init(gpu.canvas);
    await survivor.init(gpu.canvas);
    expect(gpu.configure).not.toHaveBeenCalled();

    loser.dispose();
    survivor.setLayers([]);
    survivor.render();
    expect(gpu.configure).toHaveBeenCalledTimes(1);
    expect(blit).toHaveBeenCalledTimes(1);

    survivor.render();
    expect(gpu.configure).toHaveBeenCalledTimes(1);
    survivor.dispose();
  });

  it("configures the canvas in the format the shared core blits into", async () => {
    // The core's blit pipeline targets rgba8unorm. A canvas configured with
    // the browser's preferred format (bgra8unorm on macOS and Windows) fails
    // render-pass validation on every present and the preview stays black.
    const gpu = fakeGpu();
    const compositor = new WebGPUCompositor();
    await compositor.init(gpu.canvas);
    compositor.setLayers([]);
    compositor.render();
    expect(gpu.configure).toHaveBeenCalledWith(
      expect.objectContaining({ device: gpu.device, format: "rgba8unorm" })
    );
    compositor.dispose();
  });

  it("uploads an OffscreenCanvas source, and again on every frame", async () => {
    // A 3D layer's session redraws into one canvas at one size, so the upload
    // key cannot be the size: keying on it marks the first pose current and the
    // model then holds it for the whole clip.
    const gpu = fakeGpu();
    const compositor = new WebGPUCompositor();
    await compositor.init(gpu.canvas);
    const upload = lastUpload();
    const canvas = stub<OffscreenCanvas>({
      width: 64,
      height: 32,
      getContext: (() => null) as OffscreenCanvas["getContext"]
    });

    expect(upload("m:clip-1", canvas)).not.toBeNull();
    expect(gpu.copyExternalImageToTexture).toHaveBeenCalledWith(
      { source: canvas, flipY: false },
      expect.objectContaining({ premultipliedAlpha: false }),
      { width: 64, height: 32 }
    );

    upload("m:clip-1", canvas);
    expect(gpu.copyExternalImageToTexture).toHaveBeenCalledTimes(2);
    compositor.dispose();
  });

  it("uploads an ImageBitmap once while its size holds", async () => {
    // The contrast case for the one above: a rasterized bitmap is replaced when
    // its pixels change, so re-uploading it every frame would be pure cost.
    const gpu = fakeGpu();
    const compositor = new WebGPUCompositor();
    await compositor.init(gpu.canvas);
    const upload = lastUpload();
    const bitmap = stub<ImageBitmap>({ width: 64, height: 32 });

    upload("t:clip-1", bitmap);
    upload("t:clip-1", bitmap);
    expect(gpu.copyExternalImageToTexture).toHaveBeenCalledTimes(1);
    compositor.dispose();
  });

  it("uploads a tracked video only when a decoded frame arrives and cancels its callback", async () => {
    const gpu = fakeGpu();
    const compositor = new WebGPUCompositor();
    await compositor.init(gpu.canvas);
    const upload = lastUpload();
    const video = document.createElement("video");
    Object.defineProperties(video, {
      readyState: { configurable: true, value: 2 },
      videoWidth: { configurable: true, value: 64 },
      videoHeight: { configurable: true, value: 32 }
    });
    let callback: VideoFrameRequestCallback | undefined;
    const cancel = jest.fn();
    video.requestVideoFrameCallback = (next) => { callback = next; return 1; };
    video.cancelVideoFrameCallback = cancel;
    const onFrame = jest.fn();
    const stop = trackPreviewVideoFrames(video, onFrame);
    expect(upload("v:clip", video)).toBeNull();
    expect(gpu.copyExternalImageToTexture).not.toHaveBeenCalled();

    callback?.(0, { presentedFrames: 1 } as VideoFrameCallbackMetadata);
    upload("v:clip", video);
    upload("v:clip", video);
    expect(gpu.copyExternalImageToTexture).toHaveBeenCalledTimes(1);
    callback?.(1, { presentedFrames: 2 } as VideoFrameCallbackMetadata);
    upload("v:clip", video);
    expect(gpu.copyExternalImageToTexture).toHaveBeenCalledTimes(2);
    expect(onFrame).toHaveBeenCalledTimes(2);
    const generation = previewVideoFrameGeneration(video);
    stop();
    expect(cancel).toHaveBeenCalledWith(1);
    video.src = "https://example.test/replacement.mp4";
    const restart = trackPreviewVideoFrames(video, onFrame);
    expect(previewVideoFrameGeneration(video)).toBeGreaterThan(generation ?? 0);
    upload("v:clip", video);
    expect(gpu.copyExternalImageToTexture).toHaveBeenCalledTimes(2);
    callback?.(2, { presentedFrames: 1 } as VideoFrameCallbackMetadata);
    upload("v:clip", video);
    expect(gpu.copyExternalImageToTexture).toHaveBeenCalledTimes(3);
    restart();
    compositor.dispose();
  });

  it("reuses a same-size texture when source pixels are replaced", async () => {
    const gpu = fakeGpu();
    const createTexture = jest.spyOn(gpu.device, "createTexture");
    const compositor = new WebGPUCompositor();
    await compositor.init(gpu.canvas);
    const upload = lastUpload();
    upload("t:clip", stub<ImageBitmap>({ width: 64, height: 32 }));
    upload("t:clip", stub<ImageBitmap>({ width: 64, height: 32 }));
    expect(createTexture).toHaveBeenCalledTimes(1);
    expect(gpu.copyExternalImageToTexture).toHaveBeenCalledTimes(2);
    compositor.dispose();
  });

  it("keeps untracked export video uploads seek and source dependent", async () => {
    const gpu = fakeGpu();
    const compositor = new WebGPUCompositor();
    await compositor.init(gpu.canvas);
    const upload = lastUpload();
    const video = document.createElement("video");
    Object.defineProperties(video, {
      readyState: { configurable: true, value: 2 },
      videoWidth: { configurable: true, value: 64 },
      videoHeight: { configurable: true, value: 32 }
    });
    video.src = "https://example.test/first.mp4";
    video.currentTime = 1;
    upload("v:export", video);
    video.currentTime = 2;
    upload("v:export", video);
    video.src = "https://example.test/replacement.mp4";
    video.currentTime = 2;
    upload("v:export", video);
    expect(gpu.copyExternalImageToTexture).toHaveBeenCalledTimes(3);
    compositor.dispose();
  });

  it("falls back to seek-based uploads without a decoded-frame callback", async () => {
    const gpu = fakeGpu();
    const compositor = new WebGPUCompositor();
    await compositor.init(gpu.canvas);
    const upload = lastUpload();
    const video = document.createElement("video");
    Object.defineProperties(video, {
      readyState: { configurable: true, value: 2 },
      videoWidth: { configurable: true, value: 64 },
      videoHeight: { configurable: true, value: 32 }
    });
    const stop = trackPreviewVideoFrames(video, jest.fn());
    expect(previewVideoFrameGeneration(video)).toBeUndefined();
    video.currentTime = 1;
    upload("v:clip", video);
    upload("v:clip", video);
    video.currentTime = 2;
    upload("v:clip", video);
    expect(gpu.copyExternalImageToTexture).toHaveBeenCalledTimes(2);
    stop();
    compositor.dispose();
  });

  it("holds a tracked video until the requested seek frame is decoded", async () => {
    const gpu = fakeGpu();
    const compositor = new WebGPUCompositor();
    await compositor.init(gpu.canvas);
    const video = document.createElement("video");
    Object.defineProperties(video, {
      readyState: { configurable: true, value: 2 },
      videoWidth: { configurable: true, value: 64 },
      videoHeight: { configurable: true, value: 32 }
    });
    let callback: VideoFrameRequestCallback | undefined;
    video.requestVideoFrameCallback = (next) => { callback = next; return 1; };
    video.cancelVideoFrameCallback = jest.fn();
    const onFrame = jest.fn();
    const stop = trackPreviewVideoFrames(video, onFrame);
    expectPreviewVideoFrame(video, 7.25);
    callback?.(0, { mediaTime: 0, presentedFrames: 1 } as VideoFrameCallbackMetadata);
    expect(lastUpload()("v:clip", video)).toBeNull();
    expect(onFrame).not.toHaveBeenCalled();
    const events: Array<{ kind: string; mediaTime?: number }> = [];
    window.__nodetoolTimelinePerf = (event) => events.push(event);
    callback?.(1, { mediaTime: 7.25, presentedFrames: 2 } as VideoFrameCallbackMetadata);
    expect(lastUpload()("v:clip", video)).not.toBeNull();
    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(events).toEqual([expect.objectContaining({ kind: "source-upload", mediaTime: 7.25 })]);
    stop();
    compositor.dispose();
  });

  it("holds the previous texture during a seek and uploads the decoded target", async () => {
    const gpu = fakeGpu();
    const compositor = new WebGPUCompositor();
    await compositor.init(gpu.canvas);
    const upload = lastUpload();
    const video = document.createElement("video");
    let seeking = false;
    Object.defineProperties(video, {
      readyState: { configurable: true, value: 2 },
      videoWidth: { configurable: true, value: 64 },
      videoHeight: { configurable: true, value: 32 },
      seeking: { configurable: true, get: () => seeking }
    });
    video.currentTime = 1;
    const first = upload("v:clip", video);
    seeking = true;
    video.currentTime = 2;
    expect(upload("v:clip", video)).toBe(first);
    expect(gpu.copyExternalImageToTexture).toHaveBeenCalledTimes(1);
    seeking = false;
    upload("v:clip", video);
    expect(gpu.copyExternalImageToTexture).toHaveBeenCalledTimes(2);
    compositor.dispose();
  });

  it("does not reuse an old asset's texture when its video slot is replaced mid-seek", async () => {
    const gpu = fakeGpu();
    const compositor = new WebGPUCompositor();
    await compositor.init(gpu.canvas);
    const upload = lastUpload();
    const video = document.createElement("video");
    let seeking = false;
    Object.defineProperties(video, {
      readyState: { configurable: true, value: 2 },
      videoWidth: { configurable: true, value: 64 },
      videoHeight: { configurable: true, value: 32 },
      seeking: { configurable: true, get: () => seeking }
    });
    video.src = "https://example.test/old.mp4";
    expect(upload("v:slot", video)).not.toBeNull();
    seeking = true;
    video.src = "https://example.test/new.mp4";
    expect(upload("v:slot", video)).toBeNull();
    const replacement = document.createElement("video");
    Object.defineProperties(replacement, {
      readyState: { configurable: true, value: 2 },
      videoWidth: { configurable: true, value: 64 },
      videoHeight: { configurable: true, value: 32 },
      seeking: { configurable: true, value: true }
    });
    replacement.src = "https://example.test/new.mp4";
    expect(upload("v:slot", replacement)).toBeNull();
    expect(gpu.copyExternalImageToTexture).toHaveBeenCalledTimes(1);
    seeking = false;
    expect(upload("v:slot", video)).not.toBeNull();
    expect(gpu.copyExternalImageToTexture).toHaveBeenCalledTimes(2);
    compositor.dispose();
  });

  it("reports source uploads and compositor submissions only to an opted-in sink", async () => {
    const gpu = fakeGpu();
    const compositor = new WebGPUCompositor();
    await compositor.init(gpu.canvas);
    const events: Array<{ kind: string; sourceId?: string }> = [];
    window.__nodetoolTimelinePerf = (event) => events.push(event);

    const canvas = stub<OffscreenCanvas>({
      width: 32,
      height: 16,
      getContext: (() => null) as OffscreenCanvas["getContext"]
    });
    lastUpload()("diagnostic-source", canvas);
    compositor.setLayers([]);
    compositor.render();

    expect(events).toEqual([
      expect.objectContaining({
        kind: "source-upload",
        sourceId: "diagnostic-source",
        width: 32,
        height: 16
      }),
      expect.objectContaining({ kind: "compositor-submit" })
    ]);

    compositor.dispose();
  });

  it("reconfigures after a resize", async () => {
    const gpu = fakeGpu();
    const compositor = new WebGPUCompositor();
    await compositor.init(gpu.canvas);
    compositor.setLayers([]);
    compositor.render();
    compositor.resize(640, 360);
    compositor.render();
    expect(gpu.configure).toHaveBeenCalledTimes(2);
    compositor.dispose();
  });

  it("reports failed texture uploads instead of silently omitting the video", async () => {
    const gpu = fakeGpu();
    const compositor = new WebGPUCompositor();
    await compositor.init(gpu.canvas);
    gpu.copyExternalImageToTexture.mockImplementation(() => {
      throw new Error("Decoder resource is gone");
    });
    expect(() =>
      lastUpload()("v:clip-1", stub<ImageBitmap>({ width: 64, height: 32 }))
    ).toThrow("Preview texture upload failed for v:clip-1");
    compositor.dispose();
  });

  it("reports asynchronous device loss and validation errors", async () => {
    let lose: (info: GPUDeviceLostInfo) => void = () => {};
    const gpu = fakeGpu(
      new Promise((resolve) => {
        lose = resolve;
      })
    );
    const failure = jest.fn();
    const compositor = new WebGPUCompositor(failure);
    await compositor.init(gpu.canvas);
    const event = new Event("uncapturederror");
    Object.defineProperty(event, "error", {
      value: { message: "Invalid texture" }
    });
    gpu.events.dispatchEvent(event);
    expect(failure).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "gpu-validation",
        error: expect.objectContaining({ message: "Invalid texture" })
      })
    );
    lose(stub<GPUDeviceLostInfo>({ reason: "unknown", message: "GPU reset" }));
    await Promise.resolve();
    expect(failure).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "gpu-device-lost" })
    );
    compositor.dispose();
  });

  it("ignores deliberate device destruction and detaches the validation listener", async () => {
    let lose: (info: GPUDeviceLostInfo) => void = () => {};
    const gpu = fakeGpu(
      new Promise((resolve) => {
        lose = resolve;
      })
    );
    const failure = jest.fn();
    const compositor = new WebGPUCompositor(failure);
    await compositor.init(gpu.canvas);
    compositor.dispose();
    gpu.events.dispatchEvent(new Event("uncapturederror"));
    lose(stub<GPUDeviceLostInfo>({ reason: "destroyed", message: "Disposed" }));
    await Promise.resolve();
    expect(failure).not.toHaveBeenCalled();
  });
});
