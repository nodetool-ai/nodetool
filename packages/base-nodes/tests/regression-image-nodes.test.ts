/**
 * Regression tests for image.ts node fixes.
 *
 * Each test targets a specific bug that existed in earlier implementations:
 *   1. LoadImageFolder include_subdirectories was ignored (flat readdir)
 *   2. LoadImageFolder extensions were hardcoded
 *   3. LoadImageFolder pattern was ignored
 *   4. SaveImageFile overwrite=false always overwrote
 *   5. GetMetadata returned wrong output schema
 *   6. TextToImage missing provider params
 *   7. ImageToImage empty image validation
 *   8. BatchToList null/invalid batch validation
 */
import { describe, it, expect, afterEach } from "vitest";
import sharp from "sharp";
import { promises as fs } from "node:fs";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  LoadImageFolderNode,
  SaveImageFileImageNode,
  GetMetadataNode,
  TextToImageNode,
  ImageToImageNode,
  BatchToListNode
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a small test PNG buffer. */
async function makePngBuffer(
  w = 4,
  h = 4,
  r = 128,
  g = 64,
  b = 32
): Promise<Buffer> {
  return sharp({
    create: { width: w, height: h, channels: 3, background: { r, g, b } }
  })
    .png()
    .toBuffer();
}

/** Create a small test BMP buffer. */
async function makeBmpBuffer(w = 4, h = 4): Promise<Buffer> {
  return sharp({
    create: {
      width: w,
      height: h,
      channels: 3,
      background: { r: 200, g: 100, b: 50 }
    }
  })
    .raw()
    .toBuffer()
    .then((raw) => {
      // Minimal BMP: header (14) + DIB header (40) + pixel data
      const rowSize = Math.ceil((w * 3) / 4) * 4;
      const pixelDataSize = rowSize * h;
      const fileSize = 54 + pixelDataSize;
      const buf = Buffer.alloc(fileSize);
      // BMP header
      buf.write("BM", 0);
      buf.writeUInt32LE(fileSize, 2);
      buf.writeUInt32LE(54, 10); // pixel data offset
      // DIB header (BITMAPINFOHEADER)
      buf.writeUInt32LE(40, 14); // header size
      buf.writeInt32LE(w, 18);
      buf.writeInt32LE(h, 22);
      buf.writeUInt16LE(1, 26); // planes
      buf.writeUInt16LE(24, 28); // bits per pixel
      buf.writeUInt32LE(pixelDataSize, 34);
      // pixel data (bottom-up BGR)
      for (let y = h - 1; y >= 0; y--) {
        for (let x = 0; x < w; x++) {
          const srcIdx = (y * w + x) * 3;
          const dstIdx = 54 + (h - 1 - y) * rowSize + x * 3;
          buf[dstIdx] = raw[srcIdx + 2]; // B
          buf[dstIdx + 1] = raw[srcIdx + 1]; // G
          buf[dstIdx + 2] = raw[srcIdx]; // R
        }
      }
      return buf;
    });
}

/** Create a base64 image ref from a buffer. */
function imageRefFromBuffer(buf: Buffer): Record<string, unknown> {
  return {
    type: "image",
    data: buf.toString("base64"),
    uri: ""
  };
}

/** Collect all results from an async generator. */
async function collectGen(
  gen: AsyncGenerator<Record<string, unknown>>
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  for await (const item of gen) {
    results.push(item);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Temp directory management
// ---------------------------------------------------------------------------

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "img-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of tempDirs) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
  tempDirs.length = 0;
});

// ---------------------------------------------------------------------------
// 1. LoadImageFolder include_subdirectories
// ---------------------------------------------------------------------------

describe("LoadImageFolderNode — include_subdirectories", () => {
  it("finds images in subdirectories when include_subdirectories=true", async () => {
    const dir = createTempDir();
    const subdir = path.join(dir, "sub");
    await fs.mkdir(subdir);
    const png = await makePngBuffer();
    await fs.writeFile(path.join(dir, "top.png"), png);
    await fs.writeFile(path.join(subdir, "nested.png"), png);

    const node = new LoadImageFolderNode();
    node.assign({ folder: dir, include_subdirectories: true });
    const results = await collectGen(node.genProcess());

    const names = results.map((r) => r.name);
    expect(names).toContain("top.png");
    expect(names).toContain("nested.png");
    expect(results.length).toBe(2);
  });

  it("skips subdirectory images when include_subdirectories=false", async () => {
    const dir = createTempDir();
    const subdir = path.join(dir, "sub");
    await fs.mkdir(subdir);
    const png = await makePngBuffer();
    await fs.writeFile(path.join(dir, "top.png"), png);
    await fs.writeFile(path.join(subdir, "nested.png"), png);

    const node = new LoadImageFolderNode();
    node.assign({ folder: dir, include_subdirectories: false });
    const results = await collectGen(node.genProcess());

    const names = results.map((r) => r.name);
    expect(names).toContain("top.png");
    expect(names).not.toContain("nested.png");
    expect(results.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 2. LoadImageFolder extensions filter
// ---------------------------------------------------------------------------

describe("LoadImageFolderNode — extensions filter", () => {
  it("returns only files matching the given extensions", async () => {
    const dir = createTempDir();
    const png = await makePngBuffer();
    const bmp = await makeBmpBuffer();
    await fs.writeFile(path.join(dir, "photo.png"), png);
    await fs.writeFile(path.join(dir, "photo.bmp"), bmp);

    const node = new LoadImageFolderNode();
    node.assign({ folder: dir, extensions: [".png"] });
    const results = await collectGen(node.genProcess());

    const names = results.map((r) => r.name);
    expect(names).toContain("photo.png");
    expect(names).not.toContain("photo.bmp");
    expect(results.length).toBe(1);
  });

  it("uses default extensions when none specified", async () => {
    const dir = createTempDir();
    const png = await makePngBuffer();
    await fs.writeFile(path.join(dir, "photo.png"), png);
    await fs.writeFile(path.join(dir, "notes.txt"), "hello");

    const node = new LoadImageFolderNode();
    node.assign({ folder: dir });
    const results = await collectGen(node.genProcess());

    const names = results.map((r) => r.name);
    expect(names).toContain("photo.png");
    expect(names).not.toContain("notes.txt");
  });
});

// ---------------------------------------------------------------------------
// 3. LoadImageFolder pattern matching
// ---------------------------------------------------------------------------

describe("LoadImageFolderNode — pattern matching", () => {
  it("filters files by glob pattern", async () => {
    const dir = createTempDir();
    const png = await makePngBuffer();
    await fs.writeFile(path.join(dir, "cat.png"), png);
    await fs.writeFile(path.join(dir, "dog.png"), png);

    const node = new LoadImageFolderNode();
    node.assign({ folder: dir, pattern: "cat*" });
    const results = await collectGen(node.genProcess());

    const names = results.map((r) => r.name);
    expect(names).toContain("cat.png");
    expect(names).not.toContain("dog.png");
    expect(results.length).toBe(1);
  });

  it("returns all files when pattern is empty", async () => {
    const dir = createTempDir();
    const png = await makePngBuffer();
    await fs.writeFile(path.join(dir, "cat.png"), png);
    await fs.writeFile(path.join(dir, "dog.png"), png);

    const node = new LoadImageFolderNode();
    node.assign({ folder: dir, pattern: "" });
    const results = await collectGen(node.genProcess());

    expect(results.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 4. SaveImageFile overwrite=false generates unique names
// ---------------------------------------------------------------------------

describe("SaveImageFileImageNode — overwrite=false", () => {
  it("appends _1 suffix when file already exists", async () => {
    const dir = createTempDir();
    const png = await makePngBuffer();
    const imgRef = imageRefFromBuffer(png);

    // First save
    const node1 = new SaveImageFileImageNode();
    node1.assign({ image: imgRef, folder: dir, filename: "test.png", overwrite: false });
    const result1 = await node1.process();
    const path1 = result1.output as string;
    expect(path1).toContain("test.png");
    expect(path1).not.toContain("_1");

    // Second save — same name, overwrite=false
    const node2 = new SaveImageFileImageNode();
    node2.assign({ image: imgRef, folder: dir, filename: "test.png", overwrite: false });
    const result2 = await node2.process();
    const path2 = result2.output as string;

    // The second file must have a different name (e.g. test_1.png)
    expect(path2).not.toBe(path1);
    expect(path2).toContain("_1");

    // Both files should exist on disk
    await expect(fs.access(path1)).resolves.toBeUndefined();
    await expect(fs.access(path2)).resolves.toBeUndefined();
  });

  it("overwrites when overwrite=true", async () => {
    const dir = createTempDir();
    const png = await makePngBuffer();
    const imgRef = imageRefFromBuffer(png);

    const node1 = new SaveImageFileImageNode();
    node1.assign({ image: imgRef, folder: dir, filename: "test.png", overwrite: true });
    const result1 = await node1.process();

    const node2 = new SaveImageFileImageNode();
    node2.assign({ image: imgRef, folder: dir, filename: "test.png", overwrite: true });
    const result2 = await node2.process();

    // Both should return the same path
    expect(result1.output).toBe(result2.output);
  });
});

// ---------------------------------------------------------------------------
// 5. GetMetadata output schema
// ---------------------------------------------------------------------------

describe("GetMetadataNode — output schema", () => {
  it("returns format, mode, width, height, channels", async () => {
    const png = await makePngBuffer(4, 4);
    const imgRef = imageRefFromBuffer(png);

    const node = new GetMetadataNode();
    node.assign({ image: imgRef });
    const result = await node.process();

    // Must have correct fields
    expect(result).toHaveProperty("format");
    expect(result).toHaveProperty("mode");
    expect(result).toHaveProperty("width");
    expect(result).toHaveProperty("height");
    expect(result).toHaveProperty("channels");

    // Must NOT have old incorrect fields
    expect(result).not.toHaveProperty("uri");
    expect(result).not.toHaveProperty("mime_type");
    expect(result).not.toHaveProperty("size_bytes");

    // Validate values
    expect(result.format).toBe("PNG");
    expect(result.mode).toBe("RGB");
    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
    expect(result.channels).toBe(3);
  });

  it("static metadataOutputTypes matches output keys", () => {
    const keys = Object.keys(GetMetadataNode.metadataOutputTypes);
    expect(keys).toEqual(
      expect.arrayContaining(["format", "mode", "width", "height", "channels"])
    );
    expect(keys).not.toContain("uri");
    expect(keys).not.toContain("mime_type");
    expect(keys).not.toContain("size_bytes");
  });
});

// ---------------------------------------------------------------------------
// 6. TextToImage provider params
// ---------------------------------------------------------------------------

describe("TextToImageNode — provider params", () => {
  it("has guidance_scale, num_inference_steps, seed properties", () => {
    const node = new TextToImageNode();
    // These should be assignable without error
    node.assign({
      guidance_scale: 7.5,
      num_inference_steps: 30,
      seed: 42
    });
    expect(node.guidance_scale).toBe(7.5);
    expect(node.num_inference_steps).toBe(30);
    expect(node.seed).toBe(42);
  });

  it("does not have a quality property in metadataOutputTypes or basicFields", () => {
    expect(TextToImageNode.basicFields).not.toContain("quality");
    expect(TextToImageNode.metadataOutputTypes).not.toHaveProperty("quality");
  });

  it("basicFields includes seed", () => {
    expect(TextToImageNode.basicFields).toContain("seed");
  });
});

// ---------------------------------------------------------------------------
// 7. ImageToImage empty validation
// ---------------------------------------------------------------------------

describe("ImageToImageNode — empty image validation", () => {
  it("throws when image is empty/null", async () => {
    const node = new ImageToImageNode();
    node.assign({ image: { type: "image", data: null, uri: "" } });

    // process() needs a context with runProviderPrediction, but should throw
    // before reaching the provider call because image is empty
    await expect(node.process({} as never)).rejects.toThrow(/empty/i);
  });

  it("throws when image data is a zero-length buffer", async () => {
    const node = new ImageToImageNode();
    node.assign({
      image: {
        type: "image",
        data: Buffer.alloc(0).toString("base64"),
        uri: ""
      }
    });

    await expect(node.process({} as never)).rejects.toThrow(/empty/i);
  });
});

// ---------------------------------------------------------------------------
// 8. BatchToList validation
// ---------------------------------------------------------------------------

describe("BatchToListNode — validation", () => {
  it("throws when batch is null", async () => {
    const node = new BatchToListNode();
    node.assign({ batch: null });

    await expect(node.process()).rejects.toThrow(/empty/i);
  });

  it("throws when batch data is null", async () => {
    const node = new BatchToListNode();
    node.assign({ batch: { type: "image", data: null, uri: "" } });

    await expect(node.process()).rejects.toThrow(/null/i);
  });

  it("wraps a single image ref into a list when data is not an array", async () => {
    const png = await makePngBuffer();
    const imgRef = imageRefFromBuffer(png);

    const node = new BatchToListNode();
    node.assign({ batch: imgRef });
    const result = await node.process();

    expect(result.output).toBeDefined();
    expect(Array.isArray(result.output)).toBe(true);
    expect((result.output as unknown[]).length).toBe(1);
  });
});
