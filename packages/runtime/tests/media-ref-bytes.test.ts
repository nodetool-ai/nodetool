import { describe, it, expect, vi } from "vitest";
import { loadMediaRefBytes } from "../src/media-ref-bytes.js";
import type { ProcessingContext } from "../src/context.js";

describe("loadMediaRefBytes", () => {
  it("loads inline base64 data", async () => {
    const payload = Buffer.from([1, 2, 3]).toString("base64");
    const bytes = await loadMediaRefBytes({
      type: "image",
      uri: "",
      data: payload
    });
    expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("resolves storage via asset_id when uri is stale", async () => {
    const ctx = {
      storage: {
        retrieve: vi.fn(async (uri: string) =>
          uri === "/api/storage/asset-99.png" ? new Uint8Array([4, 5, 6]) : null
        )
      }
    } as unknown as ProcessingContext;

    const bytes = await loadMediaRefBytes(
      {
        type: "image",
        uri: "C:\\missing\\path.png",
        asset_id: "asset-99"
      },
      ctx
    );

    expect(bytes).toEqual(new Uint8Array([4, 5, 6]));
  });

  it("resolves asset:// via context.resolveAssetBytes", async () => {
    const ctx = {
      resolveAssetBytes: vi.fn(async () => ({
        bytes: new Uint8Array([7, 8, 9]),
        attempts: []
      }))
    } as unknown as ProcessingContext;

    const bytes = await loadMediaRefBytes(
      { type: "image", uri: "asset://abc-123.png" },
      ctx
    );

    expect(bytes).toEqual(new Uint8Array([7, 8, 9]));
    expect(ctx.resolveAssetBytes).toHaveBeenCalledWith("asset://abc-123.png");
  });
});
