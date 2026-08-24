/**
 * Regression: a blob-carried output keeps the ref the worker sent.
 *
 * `materializeOutputs` used to rebuild the output as a fresh `{uri, type}` from
 * the declared media kind, so every other field the ref carried was discarded —
 * a VideoRef's `duration` and `format`, a Model3DRef's `format`,
 * `material_file` and `texture_files`, which are what make the asset
 * renderable (nodetool-ai/nodetool#5188).
 *
 * The same line picked the storage extension from a fixed per-kind table, so a
 * ref declaring `format: "jpeg"` was stored as `.png`.
 *
 * Both tests feed the executor an `ExecuteResult` that carries the ref in
 * `outputs` and its bytes in `blobs` — the host contract. See the PR for what
 * the worker sends today.
 */

import { describe, it, expect, vi } from "vitest";

import { PythonNodeExecutor } from "../src/python-node-executor.js";
import type { PythonStdioBridge } from "../src/index.js";
import type { ExecuteResult } from "../src/python-bridge-types.js";
import type { ProcessingContext } from "../src/context.js";

function createBridge(result: ExecuteResult): PythonStdioBridge {
  return {
    execute: vi.fn().mockResolvedValue(result),
    executeStream: vi.fn(),
    hasNodeType: vi.fn().mockReturnValue(true),
    getNodeMetadata: vi.fn().mockReturnValue([])
  } as unknown as PythonStdioBridge;
}

/** A context whose storage echoes the key it was asked to store under. */
function createContext(): ProcessingContext {
  return {
    jobId: "job-1",
    workflowId: "wf-1",
    userId: "user-1",
    getSecret: vi.fn().mockResolvedValue(null),
    storage: {
      retrieve: vi.fn(),
      store: vi.fn(async (key: string) => `file:///tmp/${key}`),
      exists: vi.fn().mockResolvedValue(false)
    }
  } as unknown as ProcessingContext;
}

/** The `(key, bytes, contentType)` the executor asked storage to write. */
function storeCall(ctx: ProcessingContext): [string, Uint8Array, string] {
  const store = ctx.storage!.store as unknown as {
    mock: { calls: [string, Uint8Array, string][] };
  };
  expect(store.mock.calls).toHaveLength(1);
  return store.mock.calls[0]!;
}

describe("blob-carried output metadata", () => {
  it("keeps a VideoRef's duration and format", async () => {
    const ctx = createContext();
    const bridge = createBridge({
      outputs: {
        output: {
          type: "video",
          uri: "blob://clip",
          duration: 12.5,
          format: "webm"
        }
      },
      blobs: { output: new Uint8Array([1, 2, 3]) }
    });
    const executor = new PythonNodeExecutor(
      bridge,
      "test.VideoNode",
      {},
      { output: "VideoRef" },
      []
    );

    const out = (await executor.process({}, ctx))["output"] as Record<
      string,
      unknown
    >;

    expect(out["duration"]).toBe(12.5);
    expect(out["format"]).toBe("webm");
    expect(out["type"]).toBe("video");
    // The uri is the one field the host owns: it points at what it just stored,
    // never at the worker's blob:// pointer.
    expect(out["uri"]).not.toBe("blob://clip");
    expect(out["uri"]).toMatch(/^file:\/\/\/tmp\/python-bridge\//);
  });

  it("keeps a Model3DRef's format, material_file and texture_files", async () => {
    const ctx = createContext();
    const bridge = createBridge({
      outputs: {
        output: {
          type: "model_3d",
          uri: "blob://model",
          format: "obj",
          material_file: { type: "image", uri: "file://model.mtl" },
          texture_files: [{ type: "image", uri: "file://wood.png" }]
        }
      },
      blobs: { output: new Uint8Array([4, 5, 6]) }
    });
    const executor = new PythonNodeExecutor(
      bridge,
      "test.Model3DNode",
      {},
      { output: "Model3DRef" },
      []
    );

    const out = (await executor.process({}, ctx))["output"] as Record<
      string,
      unknown
    >;

    expect(out["format"]).toBe("obj");
    expect(out["material_file"]).toEqual({
      type: "image",
      uri: "file://model.mtl"
    });
    expect(out["texture_files"]).toEqual([
      { type: "image", uri: "file://wood.png" }
    ]);
  });

  it("stores under the extension and content type the ref declares", async () => {
    const ctx = createContext();
    const bridge = createBridge({
      outputs: { output: { type: "image", uri: "blob://img", format: "jpeg" } },
      blobs: { output: new Uint8Array([7, 8]) }
    });
    const executor = new PythonNodeExecutor(
      bridge,
      "test.ImageNode",
      {},
      { output: "ImageRef" },
      []
    );

    await executor.process({}, ctx);

    const [key, , contentType] = storeCall(ctx);
    expect(key).toMatch(/\.jpeg$/);
    expect(contentType).toBe("image/jpeg");
  });

  it("falls back to the media kind's extension when the ref names no format", async () => {
    const ctx = createContext();
    const bridge = createBridge({
      outputs: { output: { type: "image", uri: "blob://img" } },
      blobs: { output: new Uint8Array([7, 8]) }
    });
    const executor = new PythonNodeExecutor(
      bridge,
      "test.ImageNode",
      {},
      { output: "ImageRef" },
      []
    );

    await executor.process({}, ctx);

    const [key, , contentType] = storeCall(ctx);
    expect(key).toMatch(/\.png$/);
    expect(contentType).toBe("image/png");
  });

  it("refuses a format that would escape the storage key", async () => {
    const ctx = createContext();
    const bridge = createBridge({
      outputs: {
        output: { type: "image", uri: "blob://img", format: "../../etc/passwd" }
      },
      blobs: { output: new Uint8Array([7, 8]) }
    });
    const executor = new PythonNodeExecutor(
      bridge,
      "test.ImageNode",
      {},
      { output: "ImageRef" },
      []
    );

    await executor.process({}, ctx);

    const [key] = storeCall(ctx);
    expect(key).not.toContain("..");
    expect(key).toMatch(/^python-bridge\/[0-9a-f-]+\.png$/);
  });

  // ── The behaviour that must NOT change ────────────────────────────────────

  it("an ImageRef travelling as a blob still gets the stored uri and no inline bytes", async () => {
    const ctx = createContext();
    const bridge = createBridge({
      outputs: { output: { type: "image", uri: "blob://img", data: null } },
      blobs: { output: new Uint8Array([1, 2, 3]) }
    });
    const executor = new PythonNodeExecutor(
      bridge,
      "test.ImageNode",
      {},
      { output: "ImageRef" },
      []
    );

    const out = (await executor.process({}, ctx))["output"] as Record<
      string,
      unknown
    >;

    expect(out["type"]).toBe("image");
    expect(out["uri"]).toMatch(/^file:\/\/\/tmp\/python-bridge\//);
    expect(out["data"]).toBeFalsy();
    expect(storeCall(ctx)[1]).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("drops bytes a ref carries alongside its blob rather than duplicating the payload", async () => {
    const ctx = createContext();
    const bytes = new Uint8Array([9, 9, 9]);
    const bridge = createBridge({
      outputs: {
        output: { type: "image", uri: "blob://img", data: bytes, format: "png" }
      },
      blobs: { output: bytes }
    });
    const executor = new PythonNodeExecutor(
      bridge,
      "test.ImageNode",
      {},
      { output: "ImageRef" },
      []
    );

    const out = (await executor.process({}, ctx))["output"] as Record<
      string,
      unknown
    >;

    // Tested by value, not by field name: the payload lives at `uri` now.
    expect(out).not.toHaveProperty("data");
    expect(out["format"]).toBe("png");
  });

  it("still produces a typed ref with inline bytes when no storage is configured", async () => {
    const bridge = createBridge({
      outputs: {
        output: { type: "video", uri: "blob://clip", duration: 3, format: "mp4" }
      },
      blobs: { output: new Uint8Array([1, 2]) }
    });
    const executor = new PythonNodeExecutor(
      bridge,
      "test.VideoNode",
      {},
      { output: "VideoRef" },
      []
    );

    const out = (await executor.process({}))["output"] as Record<
      string,
      unknown
    >;

    expect(out["type"]).toBe("video");
    expect(out["data"]).toEqual(new Uint8Array([1, 2]));
    // The metadata survives on this branch too — the two branches were
    // inconsistent before, which is how the bug reached both.
    expect(out["duration"]).toBe(3);
    expect(out["format"]).toBe("mp4");
  });

  it("passes a non-media blob through as raw bytes", async () => {
    const ctx = createContext();
    const bridge = createBridge({
      outputs: {},
      blobs: { output: new Uint8Array([5, 5]) }
    });
    const executor = new PythonNodeExecutor(
      bridge,
      "test.RawNode",
      {},
      { output: "bytes" },
      []
    );

    const out = await executor.process({}, ctx);

    expect(out["output"]).toEqual(new Uint8Array([5, 5]));
    expect(ctx.storage!.store).not.toHaveBeenCalled();
  });

  it("ignores a prototype-named output rather than spreading Object.prototype", async () => {
    const ctx = createContext();
    const bridge = createBridge({
      outputs: {},
      // A computed key, so this is an OWN property — a `__proto__:` literal
      // would set the prototype instead and test nothing.
      blobs: { ["__proto__"]: new Uint8Array([1]) } as unknown as Record<
        string,
        Uint8Array
      >
    });
    const executor = new PythonNodeExecutor(
      bridge,
      "test.EvilNode",
      {},
      { output: "ImageRef" },
      []
    );

    const out = await executor.process({}, ctx);

    expect(Object.hasOwn(out, "__proto__")).toBe(true);
    expect(out["__proto__"]).toEqual(new Uint8Array([1]));
  });
});
