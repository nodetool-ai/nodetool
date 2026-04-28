import { describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { PythonNodeExecutor } from "../src/python-node-executor.js";

import type { PythonStdioBridge } from "../src/index.js";
import type {
  ExecuteResult,
  RealtimeOutputFrameEvent
} from "../src/python-bridge-types.js";
import type { ProcessingContext } from "../src/context.js";

class FakeRealtimeBridge {
  private frameListener: ((event: RealtimeOutputFrameEvent) => void) | null =
    null;
  private errorListener: ((event: { session_id: string; error: string }) => void) | null =
    null;
  emitError = false;

  readonly startRealtimeSession = vi.fn(async () => ({
    session_id: "session-1",
    status: "running"
  }));
  readonly pushRealtimeInputFrame = vi.fn(async () => {
    queueMicrotask(() => {
      if (this.emitError) {
        this.errorListener?.({
          session_id: "session-1",
          error: "boom from process"
        });
        return;
      }
      this.frameListener?.({
        session_id: "session-1",
        handle: "frame",
        payload: { type: "realtime_video_frame", sequence: 2 }
      });
    });
    return {
      session_id: "session-1",
      ok: true,
      dropped_count: 0
    };
  });
  readonly stopRealtimeSession = vi.fn(async () => ({
    session_id: "session-1",
    ok: true,
    error: null
  }));
  readonly execute = vi.fn();

  on(
    event: string,
    listener: (event: RealtimeOutputFrameEvent | { session_id: string; error: string }) => void
  ) {
    if (event === "realtimeOutputFrame") {
      this.frameListener = listener as (event: RealtimeOutputFrameEvent) => void;
    }
    if (event === "realtimeSessionError") {
      this.errorListener = listener as (event: { session_id: string; error: string }) => void;
    }
    return this;
  }

  off(
    event: string,
    listener: (event: RealtimeOutputFrameEvent | { session_id: string; error: string }) => void
  ) {
    if (event === "realtimeOutputFrame" && this.frameListener === listener) {
      this.frameListener = null;
    }
    if (event === "realtimeSessionError" && this.errorListener === listener) {
      this.errorListener = null;
    }
    return this;
  }
}

describe("PythonNodeExecutor realtime warm state", () => {
  it("uses the warm Python realtime session for incoming realtime frames", async () => {
    const bridge = new FakeRealtimeBridge();
    const executor = new PythonNodeExecutor(
      bridge,
      "realtime.longlive.LongLive",
      { prompt: "test prompt" },
      { frame: "realtime_video_frame" },
      []
    );

    await executor.onSessionStart?.({} as never, {
      session_id: "session-1",
      workflow_id: "workflow-1",
      transport: "websocket",
      parameters: {},
      media_tracks: []
    });

    const outputs = await executor.process(
      {
        frame: { type: "realtime_video_frame", sequence: 1 }
      },
      {} as never
    );

    expect(bridge.startRealtimeSession).toHaveBeenCalledWith({
      session_id: "session-1",
      session: {
        session_id: "session-1",
        workflow_id: "workflow-1",
        transport: "websocket",
        parameters: {},
        media_tracks: []
      },
      node_type: "realtime.longlive.LongLive",
      fields: { prompt: "test prompt" },
      secrets: {}
    });
    expect(bridge.pushRealtimeInputFrame).toHaveBeenCalledWith({
      session_id: "session-1",
      handle: "frame",
      payload: { type: "realtime_video_frame", sequence: 1 }
    });
    expect(bridge.execute).not.toHaveBeenCalled();
    expect(outputs).toEqual({
      frame: { type: "realtime_video_frame", sequence: 2 }
    });
  });

  it("rejects promptly when the warm Python realtime session emits an error", async () => {
    const bridge = new FakeRealtimeBridge();
    bridge.emitError = true;
    const executor = new PythonNodeExecutor(
      bridge,
      "realtime.longlive.LongLive",
      { prompt: "test prompt" },
      { frame: "realtime_video_frame" },
      []
    );

    await executor.onSessionStart?.({} as never, {
      session_id: "session-1",
      workflow_id: "workflow-1",
      transport: "websocket",
      parameters: {},
      media_tracks: []
    });

    await expect(
      executor.process(
        {
          frame: { type: "realtime_video_frame", sequence: 1 }
        },
        {} as never
      )
    ).rejects.toThrow("boom from process");
  });
});

function createMockBridge(executeResult: ExecuteResult): PythonStdioBridge {
  return {
    execute: vi.fn().mockResolvedValue(executeResult),
    executeStream: vi.fn(),
    hasNodeType: vi.fn().mockReturnValue(true),
    getNodeMetadata: vi.fn().mockReturnValue([])
  } as unknown as PythonStdioBridge;
}

function createMockContext(
  retrieveImpl?: (uri: string) => Promise<Uint8Array | null>
): ProcessingContext {
  return {
    getSecret: vi.fn().mockResolvedValue("test-secret"),
    storage: {
      retrieve: vi.fn(retrieveImpl ?? (async () => new Uint8Array([1, 2, 3]))),
      store: vi.fn().mockResolvedValue("file:///tmp/output.png"),
      exists: vi.fn().mockResolvedValue(false)
    }
  } as unknown as ProcessingContext;
}

describe("PythonNodeExecutor", () => {
  it("calls bridge.execute with merged fields", async () => {
    const bridge = createMockBridge({
      outputs: { output: "result" },
      blobs: {}
    });

    const executor = new PythonNodeExecutor(
      bridge,
      "test.EchoNode",
      { defaultProp: "val" },
      { output: "str" },
      []
    );

    const result = await executor.process({ text: "hello" });
    expect(result).toEqual({ output: "result" });
    expect(bridge.execute).toHaveBeenCalledWith(
      "test.EchoNode",
      { text: "hello" },
      {},
      {},
      undefined
    );
  });

  it("converts output blobs to storage URIs", async () => {
    const imageBytes = new Uint8Array([137, 80, 78, 71]); // PNG magic
    const bridge = createMockBridge({
      outputs: {},
      blobs: { output: imageBytes }
    });

    const ctx = createMockContext();
    const executor = new PythonNodeExecutor(
      bridge,
      "test.ImageNode",
      {},
      { output: "ImageRef" },
      []
    );

    const result = await executor.process({}, ctx);
    expect(ctx.storage!.store).toHaveBeenCalled();
    expect(result.output).toEqual(
      expect.objectContaining({ uri: expect.any(String) })
    );
  });

  it("converts lower-case protocol media output types to stored asset refs", async () => {
    const audioBytes = new Uint8Array([82, 73, 70, 70]); // RIFF magic
    const bridge = createMockBridge({
      outputs: { chunk: { type: "chunk", content: "", done: true, content_type: "audio" } },
      blobs: { audio: audioBytes }
    });

    const ctx = createMockContext();
    vi.mocked(ctx.storage!.store).mockResolvedValue("file:///tmp/output.wav");

    const executor = new PythonNodeExecutor(
      bridge,
      "test.AudioNode",
      {},
      { audio: "audio", chunk: "chunk" },
      []
    );

    const result = await executor.process({}, ctx);
    expect(ctx.storage!.store).toHaveBeenCalled();
    expect(result.audio).toEqual({
      uri: "file:///tmp/output.wav",
      type: "audio"
    });
  });

  it("extracts media-ref lists into blob arrays", async () => {
    const bridge = createMockBridge({
      outputs: { output: "ok" },
      blobs: {}
    });

    const ctx = createMockContext(
      async (uri: string) => new Uint8Array(uri.includes("one") ? [1] : [2])
    );
    const executor = new PythonNodeExecutor(
      bridge,
      "test.ImageListNode",
      {},
      { output: "str" },
      []
    );

    await executor.process(
      {
        images: [
          { uri: "memory://one", type: "image" },
          { uri: "memory://two", type: "image" }
        ]
      },
      ctx
    );

    expect(bridge.execute).toHaveBeenCalledWith(
      "test.ImageListNode",
      {},
      {},
      { images: [new Uint8Array([1]), new Uint8Array([2])] },
      undefined
    );
  });

  it("falls back to reading local file paths for media refs", async () => {
    const bridge = createMockBridge({
      outputs: { output: "ok" },
      blobs: {}
    });

    const dir = await mkdtemp(join(tmpdir(), "nodetool-runtime-"));
    const imagePath = join(dir, "input.png");
    await writeFile(imagePath, new Uint8Array([9, 8, 7]));

    const ctx = createMockContext(async () => null);
    const executor = new PythonNodeExecutor(
      bridge,
      "test.ImageNode",
      {},
      { output: "str" },
      []
    );

    await executor.process({ image: { uri: imagePath, type: "image" } }, ctx);

    const call = vi.mocked(bridge.execute).mock.calls[0];
    expect(call[0]).toBe("test.ImageNode");
    expect(call[1]).toEqual({});
    expect(call[2]).toEqual({});
    expect(call[4]).toBeUndefined();
    expect(Uint8Array.from(call[3].image as ArrayLike<number>)).toEqual(
      new Uint8Array([9, 8, 7])
    );
  });

  it("falls back to asset_id-backed storage URLs when the uri is stale", async () => {
    const bridge = createMockBridge({
      outputs: { output: "ok" },
      blobs: {}
    });

    const ctx = createMockContext(async (uri: string) =>
      uri === "/api/storage/asset-123.png" ? new Uint8Array([4, 5, 6]) : null
    );
    const executor = new PythonNodeExecutor(
      bridge,
      "test.ImageNode",
      {},
      { output: "str" },
      []
    );

    await executor.process(
      {
        image: {
          uri: "C:\\Users\\rkt\\AppData\\Roaming\\nodetool\\assets\\missing.png",
          asset_id: "asset-123",
          type: "image"
        }
      },
      ctx
    );

    const call = vi.mocked(bridge.execute).mock.calls[0];
    expect(call[1]).toEqual({});
    expect(Uint8Array.from(call[3].image as ArrayLike<number>)).toEqual(
      new Uint8Array([4, 5, 6])
    );
  });

  it("streams Python node partial outputs when executeStream is available", async () => {
    const bridge = createMockBridge({ outputs: { text: "final" }, blobs: {} });
    vi.mocked(bridge.executeStream).mockImplementation(async function* () {
      yield { outputs: { chunk: "hello", text: null }, blobs: {} };
      yield { outputs: { chunk: " world", text: "hello world" }, blobs: {} };
    });

    const executor = new PythonNodeExecutor(
      bridge,
      "test.StreamingNode",
      {},
      { chunk: "chunk", text: "str" },
      []
    );

    const outputs: Record<string, unknown>[] = [];
    for await (const partial of executor.genProcess({ prompt: "hi" })) {
      outputs.push(partial);
    }

    expect(outputs).toEqual([
      { chunk: "hello", text: null },
      { chunk: " world", text: "hello world" }
    ]);
    expect(vi.mocked(bridge.executeStream)).toHaveBeenCalledWith(
      "test.StreamingNode",
      { prompt: "hi" },
      {},
      {},
      undefined
    );
  });
});
