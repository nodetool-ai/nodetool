import { describe, expect, it, beforeEach } from "@jest/globals";
import type { Chunk } from "../../../stores/ApiTypes";

let publishRealtimeAudioChunk: typeof import("../realtimeAudioChunkBus").publishRealtimeAudioChunk;
let subscribeRealtimeAudioChunks: typeof import("../realtimeAudioChunkBus").subscribeRealtimeAudioChunks;

beforeEach(async () => {
  jest.resetModules();
  const mod = await import("../realtimeAudioChunkBus");
  publishRealtimeAudioChunk = mod.publishRealtimeAudioChunk;
  subscribeRealtimeAudioChunks = mod.subscribeRealtimeAudioChunks;
});

const makeChunk = (seed = 1): Chunk => ({
  type: "chunk",
  content: `audio-data-${seed}`
});

describe("realtimeAudioChunkBus", () => {
  it("delivers chunks to a subscriber for the matching nodeId", () => {
    const received: unknown[] = [];
    subscribeRealtimeAudioChunks("node-1", (chunk) => received.push(chunk));
    const chunk = makeChunk();
    publishRealtimeAudioChunk("node-1", chunk);
    expect(received).toEqual([chunk]);
  });

  it("does not deliver chunks to a subscriber for a different nodeId", () => {
    const received: unknown[] = [];
    subscribeRealtimeAudioChunks("node-1", (chunk) => received.push(chunk));
    publishRealtimeAudioChunk("node-2", makeChunk());
    expect(received).toHaveLength(0);
  });

  it("supports multiple subscribers on the same nodeId", () => {
    const a: unknown[] = [];
    const b: unknown[] = [];
    subscribeRealtimeAudioChunks("node-1", (c) => a.push(c));
    subscribeRealtimeAudioChunks("node-1", (c) => b.push(c));
    publishRealtimeAudioChunk("node-1", makeChunk());
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it("unsubscribe stops delivery", () => {
    const received: unknown[] = [];
    const unsub = subscribeRealtimeAudioChunks("node-1", (c) => received.push(c));
    publishRealtimeAudioChunk("node-1", makeChunk(1));
    unsub();
    publishRealtimeAudioChunk("node-1", makeChunk(2));
    expect(received).toHaveLength(1);
  });

  it("unsubscribe is idempotent", () => {
    const unsub = subscribeRealtimeAudioChunks("node-1", () => {});
    unsub();
    expect(() => unsub()).not.toThrow();
  });

  it("publish with no subscribers does not throw", () => {
    expect(() => publishRealtimeAudioChunk("no-one", makeChunk())).not.toThrow();
  });

  it("cleans up the listener set when the last subscriber unsubscribes", () => {
    const unsub1 = subscribeRealtimeAudioChunks("node-1", () => {});
    const unsub2 = subscribeRealtimeAudioChunks("node-1", () => {});
    unsub1();
    const received: unknown[] = [];
    subscribeRealtimeAudioChunks("node-1", (c) => received.push(c));
    publishRealtimeAudioChunk("node-1", makeChunk());
    expect(received).toHaveLength(1);
    unsub2();
  });
});
