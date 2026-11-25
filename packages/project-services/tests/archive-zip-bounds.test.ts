import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { ProjectArchiveError, readProjectArchiveManifest } from "../src/project-archive.js";
import {
  decodeSketchFile,
  SKETCH_THUMBNAIL_ENTRY,
  sketchFileThumbnail
} from "../src/sketch-file.js";

describe("bounded zip inflation", () => {
  it("rejects an oversized manifest.json in readProjectArchiveManifest without inflating it", () => {
    // 65 MiB of zeros compresses to ~65 KiB.
    const huge = new Uint8Array(65 * 1024 * 1024);
    const zip = zipSync({ "manifest.json": [huge, { level: 9 }] });

    expect(() => readProjectArchiveManifest(zip)).toThrow(ProjectArchiveError);
    expect(() => readProjectArchiveManifest(zip)).toThrow(/decompressed size exceeds/i);
  });

  it("refuses an oversized thumbnail in sketchFileThumbnail", () => {
    // 20 MiB of zeros compresses to ~20 KiB.
    const huge = new Uint8Array(20 * 1024 * 1024);
    const zip = zipSync({ [SKETCH_THUMBNAIL_ENTRY]: [huge, { level: 9 }] });

    expect(sketchFileThumbnail(zip)).toBeNull();
  });

  it("rejects an oversized sketch zip in decodeSketchFile", async () => {
    // 260 MiB of zeros compresses to ~260 KiB.
    const huge = new Uint8Array(260 * 1024 * 1024);
    const zip = zipSync({ "data/layer-1.png": [huge, { level: 9 }] });

    await expect(decodeSketchFile(zip)).rejects.toThrow(/decompressed size exceeds/i);
  });
});
