/**
 * Regression tests for resolve-media-urls.
 *
 *  - #6: a traversal asset_id must NOT produce a file:// URI outside the assets
 *    dir (which base-provider would read and exfiltrate to the LLM).
 *  - #7: image/jpg and image/bmp resolve to the extension the storage path
 *    actually wrote, not a dangling .bin URL.
 */

import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { getDefaultAssetsPath } from "@nodetool-ai/config";
import { resolveContentForProvider } from "../src/resolve-media-urls.js";

function imageBlock(assetId: string, mimeType: string) {
  return [{ type: "image", image: { asset_id: assetId, mimeType } }];
}

function resolvedUri(
  assetId: string,
  mimeType: string
): string | undefined {
  const out = resolveContentForProvider(imageBlock(assetId, mimeType)) as Array<{
    image: { uri?: string };
  }>;
  return out[0].image.uri;
}

describe("resolveContentForProvider", () => {
  it("refuses a traversal asset_id instead of building an out-of-dir file:// URI (#6)", () => {
    for (const evil of [
      "../../../../etc/passwd",
      "..\\..\\secret",
      "sub/dir/id",
      "a/../../b"
    ]) {
      // No uri should be produced for an unsafe id.
      expect(resolvedUri(evil, "image/png")).toBeUndefined();
    }
  });

  it("resolves a plain asset_id to a file:// inside the assets dir", () => {
    const uri = resolvedUri("abc123", "image/png");
    expect(uri).toBeDefined();
    const filePath = fileURLToPath(uri!);
    const assetsDir = getDefaultAssetsPath();
    expect(filePath.startsWith(assetsDir)).toBe(true);
    expect(filePath.endsWith("abc123.png")).toBe(true);
  });

  it("resolves image/jpg and image/bmp to their real extensions, not .bin (#7)", () => {
    expect(resolvedUri("id1", "image/jpg")!.endsWith("id1.jpg")).toBe(true);
    expect(resolvedUri("id2", "image/bmp")!.endsWith("id2.bmp")).toBe(true);
  });
});
