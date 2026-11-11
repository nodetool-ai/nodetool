import type { Asset, Message } from "../../../stores/ApiTypes";
import type { GenerationActivity } from "../../../stores/GenerationActivityStore";
import { extractGenerationTurns } from "../../chat/generation/extractGenerationTurns";
import { buildCreateFeed, buildSessionFeed, canRetake, requestFromAsset } from "../createFeed";

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

  it("leaves out uploads, workflow outputs and non-media generations", () => {
    const feed = buildCreateFeed(
      [generation("text", { kind: "other", assetIds: ["t"] })],
      [
        asset("upload", "2026-01-01T00:00:00Z"),
        { ...asset("doc", "2026-01-01T00:00:00Z", rendered("x")), content_type: "text/plain" }
      ]
    );
    expect(feed).toEqual([]);
  });

  it("lists speech and music takes next to pictures and clips", () => {
    const feed = buildCreateFeed(
      [generation("speech", { kind: "audio", assetIds: ["s"], startedAt: Date.parse("2026-01-03") })],
      [{ ...asset("song", "2026-01-02T00:00:00Z", rendered("piano")), content_type: "audio/wav" }]
    );
    expect(feed.map((item) => [item.key, item.kind])).toEqual([
      ["speech:s", "audio"],
      ["song", "audio"]
    ]);
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

describe("buildSessionFeed with a media thread's messages", () => {
  const turn = (id: string, at: string, content: Message["content"]): Message[] => [
    {
      id,
      role: "user",
      content: [{ type: "text", text: `prompt ${id}` }],
      media_generation: { mode: "image", model: "flux" },
      created_at: at
    } as Message,
    { id: `${id}-reply`, role: "assistant", content, created_at: at } as Message
  ];

  it("lists the takes in the messages after the session's own, once each", () => {
    const messages = [
      ...turn("t1", "2026-01-01T00:00:00Z", [
        { type: "image_url", image: { type: "image", uri: "", asset_id: "old-1" } },
        // A picture with no stored asset has nothing to show.
        { type: "image_url", image: { type: "image", uri: "data:image/png;base64,AA" } }
      ]),
      ...turn("t2", "2026-01-02T00:00:00Z", [
        { type: "image_url", image: { type: "image", uri: "", asset_id: "asset-a" } }
      ]),
      ...turn("t3", "2026-01-03T00:00:00Z", [{ type: "text", text: "No model selected" }])
    ];
    const feed = buildSessionFeed(
      "thread-1",
      [generation("a", { threadId: "thread-1", startedAt: Date.parse("2026-01-05") })],
      [],
      extractGenerationTurns(messages, "connected")
    );
    expect(feed.map((item) => item.key)).toEqual(["a:asset-a", "t3", "t1:old-1"]);
    expect(feed[1]).toMatchObject({ status: "failed", error: "No model selected", kind: "image" });
    expect(feed[2]).toMatchObject({
      status: "generated",
      prompt: "prompt t1",
      model: "flux",
      request: null
    });
  });
});
