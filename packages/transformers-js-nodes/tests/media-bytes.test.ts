import { describe, expect, it, vi } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { loadMediaBytes } from "../src/transformers-base.js";

/**
 * A context that resolves NodeTool's own reference schemes, as the real
 * ProcessingContext does. `storage.retrieve` answers null for them — which is
 * exactly why these refs used to come back empty.
 */
function contextWithAsset(bytes: Uint8Array) {
  return {
    storage: { retrieve: vi.fn(async () => null) },
    resolveAssetBytes: vi.fn(async () => ({ bytes }))
  } as unknown as ProcessingContext;
}

describe("loadMediaBytes", () => {
  const payload = new Uint8Array([1, 2, 3, 4]);

  it("resolves an asset:// uri", async () => {
    const context = contextWithAsset(payload);
    const bytes = await loadMediaBytes(
      { type: "image", uri: "asset://abc123" },
      context
    );
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4]);
  });

  it("resolves a package:// uri", async () => {
    const context = contextWithAsset(payload);
    const bytes = await loadMediaBytes(
      { type: "image", uri: "package://nodetool-base/cat.png" },
      context
    );
    expect(bytes.length).toBe(4);
  });

  it("resolves a bare asset_id", async () => {
    const context = contextWithAsset(payload);
    const bytes = await loadMediaBytes(
      { type: "image", uri: "", asset_id: "abc123" },
      context
    );
    expect(bytes.length).toBe(4);
  });

  it("encodes a raw-RGBA ref from an upstream GPU op as PNG", async () => {
    const bytes = await loadMediaBytes({
      type: "image",
      mimeType: "image/x-raw-rgba",
      data: new Uint8Array([255, 0, 0, 255]),
      width: 1,
      height: 1
    });
    // PNG magic number.
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("returns empty for a missing ref", async () => {
    expect((await loadMediaBytes(undefined)).length).toBe(0);
  });
});
