/**
 * SVG stills are rasterized without ffmpeg: many ffmpeg builds (Homebrew's
 * default among them) have no SVG decoder, and a logo is the usual SVG on a
 * timeline. ffmpeg and ffprobe are made unavailable so a regression to the
 * ffmpeg path fails here on every machine.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("node:child_process", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    spawn: () => {
      throw new Error("ffmpeg must not decode an SVG still");
    }
  };
});

vi.mock("../src/nodes/ffmpeg-helpers.js", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    execFfprobe: () => Promise.reject(new Error("ffprobe must not probe an SVG still"))
  };
});

const { decodeStillRgba } = await import("../src/nodes/timeline/rawFrames.js");

let dir: string | null = null;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = null;
});

async function svgFile(name: string, svg: string): Promise<string> {
  dir ??= await mkdtemp(join(tmpdir(), "svg-still-"));
  const path = join(dir, name);
  await writeFile(path, svg);
  return path;
}

function pixel(image: { rgba: Uint8Array; width: number }, x: number, y: number): number[] {
  const at = (y * image.width + x) * 4;
  return Array.from(image.rgba.subarray(at, at + 4));
}

describe("decodeStillRgba with SVG", () => {
  it("rasterizes an SVG with no extension to straight-alpha RGBA fitted to the frame", async () => {
    const file = await svgFile(
      "f8753f46ed8643c294df8ea585562e3e",
      `<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200">` +
        `<rect x="0" y="0" width="200" height="200" fill="#1248AB"/></svg>`
    );
    const image = await decodeStillRgba(file, { width: 100, height: 100 });
    expect(image).not.toBeNull();
    expect({ width: image!.width, height: image!.height }).toEqual({ width: 100, height: 50 });
    expect(image!.rgba.length).toBe(100 * 50 * 4);
    expect(pixel(image!, 10, 25)).toEqual([0x12, 0x48, 0xab, 255]);
    expect(pixel(image!, 90, 25)[3]).toBe(0);
  });

  it("takes the size from the viewBox when the SVG has none", async () => {
    const file = await svgFile(
      "logo.svg",
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 60"><rect width="30" height="60" fill="red"/></svg>`
    );
    const image = await decodeStillRgba(file, { width: 1080, height: 1920 });
    expect(image!.height / image!.width).toBeCloseTo(2, 1);
    expect(pixel(image!, 0, 0)).toEqual([255, 0, 0, 255]);
  });

  it("throws for an SVG it cannot rasterize", async () => {
    const file = await svgFile("broken.svg", `<svg xmlns="http://www.w3.org/2000/svg"><rect`);
    await expect(decodeStillRgba(file, { width: 100, height: 100 })).rejects.toThrow(/SVG/);
  });
});
