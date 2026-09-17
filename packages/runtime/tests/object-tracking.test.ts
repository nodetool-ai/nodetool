import { describe, expect, it, vi } from "vitest";
import { BaseProvider } from "../src/providers/base-provider.js";
import { ProcessingContext } from "../src/context.js";
import type { Message, ProviderStreamItem } from "../src/providers/types.js";
import {
  parseObjectTrackingResult,
  type ObjectTrackingParams,
  type ObjectTrackingResult
} from "../src/providers/object-tracking.js";

vi.mock("../src/media-ref-bytes.js", () => ({
  loadMediaRefBytes: vi.fn(async () => new Uint8Array([1, 2, 3]))
}));

class UnsupportedProvider extends BaseProvider {
  constructor() {
    super("fake");
  }
  async generateMessage(): Promise<Message> {
    throw new Error("unused");
  }
  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    throw new Error("unused");
  }
}

class TrackingProvider extends UnsupportedProvider {
  readonly calls: ObjectTrackingParams[] = [];
  override async trackObject(
    video: Uint8Array,
    params: ObjectTrackingParams
  ): Promise<ObjectTrackingResult> {
    expect(video).toEqual(new Uint8Array([1, 2, 3]));
    this.calls.push(params);
    return { samples: [{ sourceMs: params.startMs, ...params.initialRegion }] };
  }
}

const request = {
  sourceAssetId: "source",
  initialRegion: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
  startMs: 40_000,
  endMs: 44_000,
  direction: "forward" as const
};

describe("track_object provider dispatch", () => {
  it("advertises only an implemented tracking method", () => {
    expect(new UnsupportedProvider().getCapabilities()).not.toContain(
      "track_object"
    );
    expect(new TrackingProvider().getCapabilities()).toContain("track_object");
  });

  it("dispatches the source window through the generation lifecycle with cancellation", async () => {
    const context = new ProcessingContext({});
    const provider = new TrackingProvider();
    context.registerProvider("fake", provider);
    const result = await context.runGeneration({
      provider: "fake",
      model: "tracker",
      capability: "track_object",
      params: request
    });
    expect(provider.calls).toEqual([
      { ...request, model: "tracker", signal: expect.any(AbortSignal) }
    ]);
    expect(result.output).toEqual({
      samples: [{ sourceMs: 40_000, ...request.initialRegion }]
    });
    expect(
      context
        .getMessages()
        .filter((message) => message.type === "prediction")
        .map((message) => message.status)
    ).toEqual(["running", "completed"]);
  });

  it("refuses invalid rectangles before calling a provider", async () => {
    const context = new ProcessingContext({});
    const provider = new TrackingProvider();
    context.registerProvider("fake", provider);
    await expect(
      context.runGeneration({
        provider: "fake",
        model: "tracker",
        capability: "track_object",
        params: {
          ...request,
          initialRegion: { ...request.initialRegion, width: 1 }
        }
      })
    ).rejects.toThrow();
    expect(provider.calls).toEqual([]);
  });

  it("does not call an unsupported provider", async () => {
    const context = new ProcessingContext({});
    context.registerProvider("fake", new UnsupportedProvider());
    await expect(
      context.runGeneration({
        provider: "fake",
        model: "tracker",
        capability: "track_object",
        params: request
      })
    ).rejects.toThrow("does not support");
  });

  it("honors cancellation before provider execution", async () => {
    const context = new ProcessingContext({});
    const provider = new TrackingProvider();
    context.registerProvider("fake", provider);
    const controller = new AbortController();
    controller.abort();
    await expect(
      context.runGeneration({
        provider: "fake",
        model: "tracker",
        capability: "track_object",
        params: request,
        signal: controller.signal
      })
    ).rejects.toThrow();
    expect(provider.calls).toEqual([]);
  });

  it.each([
    [],
    [{ sourceMs: 39_999, ...request.initialRegion }],
    [{ sourceMs: 44_001, ...request.initialRegion }],
    [{ sourceMs: 40_000, x: 0.9, y: 0, width: 0.5, height: 0.5 }],
    [
      { sourceMs: 41_000, ...request.initialRegion },
      { sourceMs: 40_000, ...request.initialRegion }
    ],
    [
      { sourceMs: 40_000, ...request.initialRegion },
      { sourceMs: 40_000, ...request.initialRegion }
    ]
  ])("rejects invalid sample sequences: %j", (samples) => {
    expect(() => parseObjectTrackingResult({ samples }, request)).toThrow();
  });
});
