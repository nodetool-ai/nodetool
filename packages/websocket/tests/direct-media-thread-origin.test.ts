/**
 * A `generate_media` take sent from a Create tab names the tab's thread. The
 * generation row records it, so the tab can list its takes after a reload.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { initTestDb, Prediction, Thread } from "@nodetool-ai/models";
import type { TextToImageParams } from "@nodetool-ai/runtime";

import { WebSocketClientSession } from "../src/websocket-client-session.js";

vi.mock("@nodetool-ai/asset-services/thumbnail", () => ({
  storeAssetWithThumbnail: vi.fn(async () => undefined)
}));

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  class FakeAsset {
    id = "asset-1";
    size = 0;
    user_id = "1";
    constructor(fields: Record<string, unknown>) {
      Object.assign(this, fields);
    }
    async save(): Promise<void> {}
    static find = vi.fn();
  }
  return { ...actual, Asset: FakeAsset };
});

const runner = (): WebSocketClientSession =>
  new WebSocketClientSession({
    userId: "1",
    resolveExecutor: () => undefined as never,
    resolveProvider: (async () => ({
      provider: "fake",
      async textToImages(_params: TextToImageParams): Promise<Uint8Array[]> {
        return [new Uint8Array([0x89, 0x50, 0x4e, 0x47])];
      }
    })) as never
  });

const take = (threadId?: string) =>
  runner().inference.runDirectMediaGeneration({
    mode: "image",
    provider: "fake",
    model: "fake/image",
    prompt: "a lighthouse",
    requestId: "req-1",
    ...(threadId && { threadId })
  });

describe("direct media generation thread origin", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("records the Create session the take was sent from", async () => {
    const session = await Thread.create<Thread>({
      user_id: "1",
      title: "New image",
      kind: "create"
    });
    await take(session.id);
    const [rows] = await Prediction.listGenerations("1", { threadId: session.id });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      surface: "rpc",
      request_id: "req-1",
      thread_id: session.id
    });
  });

  it("refuses a thread that belongs to someone else", async () => {
    const other = await Thread.create<Thread>({ user_id: "2", kind: "create" });
    await expect(take(other.id)).rejects.toThrow("Thread not found");
    const [rows] = await Prediction.listGenerations("1");
    expect(rows).toHaveLength(0);
  });

  it("leaves the thread empty when none is named", async () => {
    await take();
    const [rows] = await Prediction.listGenerations("1");
    expect(rows[0]?.thread_id).toBeNull();
  });
});
