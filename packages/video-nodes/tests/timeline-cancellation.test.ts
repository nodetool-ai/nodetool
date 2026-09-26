import { describe, expect, it, vi } from "vitest";
import { makeClip, makeTrack, type TimelineSequence } from "@nodetool-ai/timeline";

let resolveGpu: ((pixels: Uint8Array) => void) | undefined;
let gpuStarted = false;
let blockWrite = false;
let writeStarted = false;
let encoderAborts = 0;
let compositorDisposals = 0;
let decodeStarted = false;
let decodeSettled = false;
let decodeClosed = false;
let disposedBeforeDecode = false;
let settleDecode: ((pixels: Uint8Array | null) => void) | undefined;

vi.mock("@nodetool-ai/gpu/node", () => ({ getNodeGPUDevice: async () => ({}) }));
vi.mock("@nodetool-ai/timeline/render", async (importOriginal) => {
  const original = await importOriginal<typeof import("@nodetool-ai/timeline/render")>();
  class FakeCompositor {
    renderFrameSamples(): Promise<Uint8Array> {
      gpuStarted = true;
      return new Promise((resolve) => { resolveGpu = resolve; });
    }
    setReferenceSize(): void {}
    dispose(): void {
      compositorDisposals += 1;
      if (decodeStarted && !decodeSettled) disposedBeforeDecode = true;
    }
  }
  return { ...original, HeadlessFrameCompositor: FakeCompositor };
});
vi.mock("../src/nodes/timeline/rawFrames.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/nodes/timeline/rawFrames.js")>();
  return {
    ...original,
    probeVideoSize: async () => ({ width: 32, height: 16 }),
    openVideoFrameStream: () => ({
      width: 32,
      height: 16,
      frameAt: () => {
        decodeStarted = true;
        return new Promise<Uint8Array | null>((resolve) => {
          settleDecode = (pixels) => {
            decodeSettled = true;
            resolve(pixels);
          };
        });
      },
      close: () => {
        decodeClosed = true;
        settleDecode?.(null);
      }
    }),
    openFrameEncoder: () => ({
      write: async () => {
        writeStarted = true;
        if (blockWrite) await new Promise<void>(() => {});
      },
      finish: async () => {},
      abort: () => { encoderAborts += 1; }
    })
  };
});

const { renderTimelineComposited } = await import("../src/nodes/timeline/compositeRender.js");

const track = makeTrack({ id: "track", type: "video", index: 0, visible: true });
const shapeSequence: TimelineSequence = {
  id: "cancel-shape", name: "Cancel shape", width: 32, height: 16,
  fps: 25, durationMs: 80, tracks: [track],
  clips: [makeClip({
    id: "shape", trackId: "track", mediaType: "shape", startMs: 0,
    durationMs: 80, shapeStyle: { kind: "rect", fill: "#ffffff" }
  })]
};
const videoSequence: TimelineSequence = {
  ...shapeSequence,
  id: "cancel-video",
  clips: [makeClip({
    id: "video", trackId: "track", mediaType: "video", startMs: 0,
    durationMs: 80, status: "generated", currentAssetId: "asset-video"
  })]
};

function reset(): void {
  resolveGpu = undefined;
  gpuStarted = false;
  blockWrite = false;
  writeStarted = false;
  encoderAborts = 0;
  compositorDisposals = 0;
  decodeStarted = false;
  decodeSettled = false;
  decodeClosed = false;
  disposedBeforeDecode = false;
  settleDecode = undefined;
}

function start(sequence: TimelineSequence, signal: AbortSignal): Promise<unknown> {
  return renderTimelineComposited({
    sequence, width: 32, height: 16, fps: 25, durationMs: 80,
    resolveAssetPath: async () => "/tmp/cancel-source.mp4",
    outPath: "/tmp/cancel-output.mp4", signal
  });
}

describe("serial timeline render cancellation", () => {
  it("settles while GPU readback is blocked", async () => {
    reset();
    const controller = new AbortController();
    const run = start(shapeSequence, controller.signal);
    await vi.waitFor(() => expect(gpuStarted).toBe(true));
    controller.abort();
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(encoderAborts).toBe(1);
    expect(compositorDisposals).toBe(1);
  });

  it("settles while encoder backpressure blocks a write", async () => {
    reset();
    blockWrite = true;
    const controller = new AbortController();
    const run = start(shapeSequence, controller.signal);
    await vi.waitFor(() => expect(gpuStarted).toBe(true));
    resolveGpu?.(new Uint8Array(32 * 16 * 4));
    await vi.waitFor(() => expect(writeStarted).toBe(true));
    controller.abort();
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(encoderAborts).toBe(1);
    expect(compositorDisposals).toBe(1);
  });

  it("joins an active video decode before disposing the compositor", async () => {
    reset();
    const controller = new AbortController();
    const run = start(videoSequence, controller.signal);
    await vi.waitFor(() => expect(decodeStarted).toBe(true));
    controller.abort();
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(decodeClosed).toBe(true);
    expect(decodeSettled).toBe(true);
    expect(disposedBeforeDecode).toBe(false);
    expect(gpuStarted).toBe(false);
  });
});
