/**
 * A clip whose `currentAssetId` is a URI still gets a local file. The shipped
 * example timelines reference their stills as `package://…` URIs; naming the
 * work file after the raw reference put its slashes into the path and the
 * write failed with ENOENT, so the render skipped every such clip.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AssetFiles, assetFileName } from "../src/nodes/timeline/assetFiles.js";

const STILL = "package://nodetool-base/timelines/voltra/hero.jpg";

describe("AssetFiles", () => {
  let workDir: string;
  beforeEach(async () => {
    workDir = await mkdtemp(path.join(os.tmpdir(), "asset-files-"));
  });
  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it("writes a package:// asset to a flat file in the work dir, keeping its extension", async () => {
    const requested: string[] = [];
    const files = new AssetFiles(workDir, {
      localPath: async () => null,
      resolveAssetBytes: async (id: string) => {
        requested.push(id);
        return { bytes: new Uint8Array([1, 2, 3]), attempts: [] };
      }
    });
    const file = await files.path(STILL);
    expect(file).not.toBeNull();
    expect(path.dirname(file!)).toBe(workDir);
    expect(file!.endsWith(".jpg")).toBe(true);
    expect([...(await readFile(file!))]).toEqual([1, 2, 3]);
    // One resolution per asset, however many clips name it.
    await files.path(STILL);
    expect(requested).toEqual([STILL]);
  });

  it("uses a file the asset store keeps on this host in place", async () => {
    const files = new AssetFiles(workDir, {
      localPath: async () => "/store/abc.png",
      resolveAssetBytes: async () => {
        throw new Error("must not read bytes for a local file");
      }
    });
    expect(await files.path("abc")).toBe("/store/abc.png");
  });

  it("names distinct references distinctly and plain ids without an extension", () => {
    expect(assetFileName(STILL)).not.toBe(assetFileName(STILL.replace("hero", "side")));
    expect(assetFileName(STILL)).toMatch(/^asset_[0-9a-f]{24}\.jpg$/);
    expect(assetFileName("0123456789abcdef0123456789abcdef")).toMatch(/^asset_[0-9a-f]{24}$/);
  });
});
