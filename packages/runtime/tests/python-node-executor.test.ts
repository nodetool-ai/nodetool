import { describe, it, expect, vi } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PythonNodeExecutor } from "../src/python-node-executor.js";
import type { PythonBridge, ExecuteResult } from "../src/python-bridge.js";
import type { ProcessingContext } from "../src/context.js";

function createMockBridge(executeResult: ExecuteResult): PythonBridge {
  return {
    execute: vi.fn().mockResolvedValue(executeResult),
    hasNodeType: vi.fn().mockReturnValue(true),
    getNodeMetadata: vi.fn().mockReturnValue([])
  } as unknown as PythonBridge;
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
});
