/**
 * The session's own media-reference resolvers.
 *
 * `resolveSourceImageBytes` (image_edit / image_to_video) and
 * `resolveReferenceMediaBytes` (reference_to_video) share one per-block loader,
 * so the two shapes are pinned together: the first usable image for the one,
 * every image and video for the other. The chat-turn suite stubs these as
 * dependencies, which leaves the block walking itself untested — this covers
 * the forms a client actually sends: an inline `data:` uri, a bare base64
 * `data` field, and an unresolvable reference that must drop rather than fail
 * the turn.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { initTestDb } from "@nodetool-ai/models";
import { WebSocketClientSession } from "../src/websocket-client-session.js";

const noopExecutor = () => ({
  async process() {
    return {};
  }
});

/** The two resolvers are private; the tests drive them by name. */
interface Resolvers {
  resolveSourceImageBytes: (
    data: Record<string, unknown>,
    mediaGeneration: Record<string, unknown>,
    userId: string
  ) => Promise<Uint8Array | null>;
  resolveReferenceMediaBytes: (
    data: Record<string, unknown>,
    mediaGeneration: Record<string, unknown>,
    userId: string
  ) => Promise<{ images: Uint8Array[]; videos: Uint8Array[] }>;
}

function resolvers(): Resolvers {
  const session = new WebSocketClientSession({
    resolveExecutor: noopExecutor
  });
  return session as unknown as Resolvers;
}

const b64 = (bytes: number[]): string =>
  Buffer.from(new Uint8Array(bytes)).toString("base64");

const imageBlock = (ref: Record<string, unknown>) => ({
  type: "image_url",
  image: { type: "image", ...ref }
});
const videoBlock = (ref: Record<string, unknown>) => ({
  type: "video",
  video: { type: "video", ...ref }
});

describe("resolveReferenceMediaBytes", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("collects every image and video block, in message order", async () => {
    const result = await resolvers().resolveReferenceMediaBytes(
      {
        content: [
          { type: "text", text: "she walks into frame" },
          imageBlock({ uri: `data:image/png;base64,${b64([1, 1])}` }),
          videoBlock({ uri: `data:video/mp4;base64,${b64([3, 3])}` }),
          imageBlock({ data: b64([2, 2]) })
        ]
      },
      {},
      "user-1"
    );
    expect(result.images).toEqual([
      new Uint8Array([1, 1]),
      new Uint8Array([2, 2])
    ]);
    expect(result.videos).toEqual([new Uint8Array([3, 3])]);
  });

  it("drops a reference whose bytes cannot be reached, keeping the rest", async () => {
    const result = await resolvers().resolveReferenceMediaBytes(
      {
        content: [
          // An asset id no row exists for: the turn must still run on what
          // did resolve rather than fail on the one that did not.
          imageBlock({ asset_id: "does-not-exist" }),
          imageBlock({ uri: `data:image/png;base64,${b64([7])}` })
        ]
      },
      {},
      "user-1"
    );
    expect(result.images).toEqual([new Uint8Array([7])]);
    expect(result.videos).toEqual([]);
  });

  it("answers with empty lists when the message carries no media", async () => {
    const result = await resolvers().resolveReferenceMediaBytes(
      { content: "just text" },
      {},
      "user-1"
    );
    expect(result).toEqual({ images: [], videos: [] });
  });
});

describe("resolveSourceImageBytes", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("takes the first image block and ignores the videos", async () => {
    const bytes = await resolvers().resolveSourceImageBytes(
      {
        content: [
          videoBlock({ uri: `data:video/mp4;base64,${b64([9])}` }),
          imageBlock({ uri: `data:image/png;base64,${b64([1, 2])}` }),
          imageBlock({ uri: `data:image/png;base64,${b64([3, 4])}` })
        ]
      },
      {},
      "user-1"
    );
    expect(bytes).toEqual(new Uint8Array([1, 2]));
  });

  it("skips a block it cannot resolve rather than answering null", async () => {
    const bytes = await resolvers().resolveSourceImageBytes(
      {
        content: [
          imageBlock({ asset_id: "does-not-exist" }),
          imageBlock({ data: b64([5, 6]) })
        ]
      },
      {},
      "user-1"
    );
    expect(bytes).toEqual(new Uint8Array([5, 6]));
  });

  it("answers null when nothing resolves", async () => {
    const bytes = await resolvers().resolveSourceImageBytes(
      { content: [imageBlock({ asset_id: "does-not-exist" })] },
      {},
      "user-1"
    );
    expect(bytes).toBeNull();
  });
});
