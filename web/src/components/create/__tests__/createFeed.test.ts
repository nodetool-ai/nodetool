import type { Asset } from "../../../stores/ApiTypes";
import type { GenerationActivity } from "../../../stores/GenerationActivityStore";
import { buildCreateFeed, canRetake, requestFromAsset } from "../createFeed";

const generation = (
  id: string,
  overrides: Partial<GenerationActivity> = {}
): GenerationActivity => ({
  id,
  channel: "rpc",
  status: "generated",
  kind: "image",
  prompt: `prompt ${id}`,
  model: "flux",
  source: null,
  threadId: null,
  startedAt: 1,
  endedAt: 2,
  assetIds: [`asset-${id}`],
  error: null,
  ...overrides
});

const asset = (id: string, createdAt: string, metadata: Asset["metadata"] = null): Asset =>
  ({
    id,
    name: id,
    content_type: "image/png",
    created_at: createdAt,
    metadata
  }) as Asset;

const rendered = (prompt: string) => ({
  prompt,
  generation: {
    provider: "fake",
    model: "flux",
    capability: "text_to_image",
    params: { width: 1024, height: 1024, seed: 5 }
  }
});

describe("buildCreateFeed", () => {
  it("lists tracked generations and older renders together, newest first", () => {
    const feed = buildCreateFeed(
      [generation("a", { startedAt: Date.parse("2026-01-03") })],
      [
        asset("old", "2026-01-01T00:00:00Z", rendered("old one")),
        asset("mid", "2026-01-02T00:00:00Z", rendered("mid one"))
      ]
    );
    expect(feed.map((item) => item.key)).toEqual(["a:asset-a", "mid", "old"]);
    expect(feed[1].prompt).toBe("mid one");
  });

  it("lists an asset a tracked generation already produced once", () => {
    const feed = buildCreateFeed(
      [generation("a")],
      [asset("asset-a", "2026-01-01T00:00:00Z", rendered("dup"))]
    );
    expect(feed).toHaveLength(1);
    expect(feed[0].generation?.id).toBe("a");
  });

  it("leaves out uploads, workflow outputs, audio and non-media generations", () => {
    const feed = buildCreateFeed(
      [generation("speech", { kind: "audio", assetIds: ["s"] })],
      [
        asset("upload", "2026-01-01T00:00:00Z"),
        { ...asset("clip", "2026-01-01T00:00:00Z", rendered("x")), content_type: "audio/wav" }
      ]
    );
    expect(feed).toEqual([]);
  });

  it("keeps running and failed generations as one tile each", () => {
    const feed = buildCreateFeed(
      [
        generation("run", { status: "generating", assetIds: [], startedAt: 5 }),
        generation("bad", { status: "failed", assetIds: [], error: "refused", startedAt: 4 })
      ],
      []
    );
    expect(feed.map((item) => [item.key, item.status, item.assetId])).toEqual([
      ["run", "generating", null],
      ["bad", "failed", null]
    ]);
  });

  it("makes one tile per result when a generation returned several", () => {
    const feed = buildCreateFeed(
      [generation("multi", { assetIds: ["one", "two"] })],
      []
    );
    expect(feed.map((item) => item.assetId)).toEqual(["one", "two"]);
  });

  it("carries preset ids and the request a retake sends", () => {
    const [item] = buildCreateFeed(
      [
        generation("v", {
          kind: "video",
          preset_ids: ["camera.arc"],
          request: { mode: "video", provider: "fake", model: "wan", seed: 3 }
        })
      ],
      []
    );
    expect(item.presetIds).toEqual(["camera.arc"]);
    expect(canRetake(item)).toBe(true);
  });
});

describe("requestFromAsset", () => {
  it("reads the settings back from the asset's generation metadata", () => {
    expect(requestFromAsset(asset("x", "2026-01-01", rendered("p")))).toEqual({
      mode: "image",
      provider: "fake",
      model: "flux",
      width: 1024,
      height: 1024,
      variations: 1
    });
  });

  it("returns null for a capability the Create view does not run", () => {
    const metadata = rendered("p");
    metadata.generation.capability = "image_to_video";
    expect(requestFromAsset(asset("x", "2026-01-01", metadata))).toBeNull();
  });
});
