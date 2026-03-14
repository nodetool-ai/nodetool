import { describe, it, expect, vi } from "vitest";
import { PythonNodeExecutor } from "../src/python-node-executor.js";
import type { PythonBridge, ExecuteResult } from "../src/python-bridge.js";
import type { ProcessingContext } from "../src/context.js";

function createMockBridge(executeResult: ExecuteResult): PythonBridge {
  return {
    execute: vi.fn().mockResolvedValue(executeResult),
    hasNodeType: vi.fn().mockReturnValue(true),
    getNodeMetadata: vi.fn().mockReturnValue([]),
  } as unknown as PythonBridge;
}

function createMockContext(): ProcessingContext {
  return {
    getSecret: vi.fn().mockResolvedValue("test-secret"),
    storage: {
      retrieve: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      store: vi.fn().mockResolvedValue("file:///tmp/output.png"),
      exists: vi.fn().mockResolvedValue(false),
    },
  } as unknown as ProcessingContext;
}

describe("PythonNodeExecutor", () => {
  it("calls bridge.execute with merged fields", async () => {
    const bridge = createMockBridge({
      outputs: { output: "result" },
      blobs: {},
    });

    const executor = new PythonNodeExecutor(
      bridge,
      "test.EchoNode",
      { defaultProp: "val" },
      { output: "str" },
      [],
    );

    const result = await executor.process({ text: "hello" });
    expect(result).toEqual({ output: "result" });
    expect(bridge.execute).toHaveBeenCalledWith(
      "test.EchoNode",
      { defaultProp: "val", text: "hello" },
      {},
      {},
      undefined,
    );
  });

  it("converts output blobs to storage URIs", async () => {
    const imageBytes = new Uint8Array([137, 80, 78, 71]); // PNG magic
    const bridge = createMockBridge({
      outputs: {},
      blobs: { output: imageBytes },
    });

    const ctx = createMockContext();
    const executor = new PythonNodeExecutor(
      bridge,
      "test.ImageNode",
      {},
      { output: "ImageRef" },
      [],
    );

    const result = await executor.process({}, ctx);
    expect(ctx.storage!.store).toHaveBeenCalled();
    expect(result.output).toEqual(expect.objectContaining({ uri: expect.any(String) }));
  });
});
