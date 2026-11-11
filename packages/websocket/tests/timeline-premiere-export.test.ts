import { describe, expect, it } from "vitest";
import { readImageSize } from "../src/lib/image-size.js";
import { planPremiereExport, premiereReportHeader, premiereReportText } from "../src/lib/timeline-premiere.js";

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe("readImageSize", () => {
  it("reads PNG, GIF, JPEG and WebP headers", () => {
    expect(readImageSize(png(640, 360))).toEqual({ width: 640, height: 360 });

    const gif = new Uint8Array(13);
    gif.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x40, 0x01, 0xf0, 0x00]);
    expect(readImageSize(gif)).toEqual({ width: 320, height: 240 });

    // SOI, an APP0 segment to skip, then SOF0 with height 480 and width 720.
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x01, 0xe0, 0x02, 0xd0, 0x03, 0x01, 0x11, 0x00]);
    expect(readImageSize(jpeg)).toEqual({ width: 720, height: 480 });

    const lossless = new Uint8Array(30);
    lossless.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c, 0, 0, 0, 0, 0x2f]);
    new DataView(lossless.buffer).setUint32(21, (99) | (49 << 14), true);
    expect(readImageSize(lossless)).toEqual({ width: 100, height: 50 });

    const extended = new Uint8Array(30);
    extended.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58]);
    extended.set([0x7f, 0x07, 0x00, 0x37, 0x04, 0x00], 24);
    expect(readImageSize(extended)).toEqual({ width: 1920, height: 1080 });
  });

  it("returns nothing for other bytes or a cut-short header", () => {
    expect(readImageSize(new Uint8Array([1, 2, 3]))).toBeUndefined();
    expect(readImageSize(png(1, 1).subarray(0, 20))).toBeUndefined();
    expect(readImageSize(png(0, 5))).toBeUndefined();
    expect(readImageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02]))).toBeUndefined();
  });
});

describe("planPremiereExport", () => {
  const sequence = {
    name: "Cut",
    width: 1920,
    height: 1080,
    fps: 25,
    tracks: [{ id: "v1", name: "Picture", type: "video" as const, index: 0, visible: true, locked: false }],
    clips: [{
      id: "c1", trackId: "v1", name: "Logo", startMs: 0, durationMs: 2000, mediaType: "image" as const,
      sourceType: "imported" as const, currentAssetId: "logo", status: "generated" as const, locked: false, versions: [],
      opacity: 0.5
    }]
  };

  it("writes the probed picture size into the file and scales the picture by the contain fit", async () => {
    const plan = await planPremiereExport({
      sequence,
      fetchAsset: async () => ({ source: png(960, 540), name: "logo.png", contentType: "image/png" }),
      probe: async () => ({ width: 960, height: 540 })
    });
    expect(plan.xml).toContain("<width>960</width><height>540</height>");
    // 1920 / 960 = 2, so the picture is 200% of its own size.
    expect(plan.xml).toMatch(/<parameterid>scale<\/parameterid><name>Scale<\/name><valuemin>0<\/valuemin><valuemax>1000<\/valuemax><value>200<\/value>/);
    expect(plan.report.warnings).toEqual([]);
  });

  it("lists what was left out in the report text", async () => {
    const plan = await planPremiereExport({
      sequence: { ...sequence, clips: [{ ...sequence.clips[0]!, effects: [{ id: "e", type: "blur", enabled: true } as never] }] },
      fetchAsset: async () => ({ source: png(1920, 1080), name: "logo.png", contentType: "image/png" }),
      probe: async () => ({})
    });
    const text = premiereReportText("Cut", plan);
    expect(text).toContain("Clips exported: 1");
    expect(text).toContain("- Logo: effects require baking.");
  });
});

describe("premiereReportHeader", () => {
  const read = (header: string) => JSON.parse(decodeURIComponent(header)) as { clipsExported: number; warnings: string[]; omitted: number };

  it("carries the clip count and every message when they fit", () => {
    const header = premiereReportHeader({ clipsExported: 2, warnings: [{ message: "A: effects require baking." }, { message: "B: 100% \u00e9" }] });
    expect(header).not.toMatch(/[^\x21-\x7e]/);
    expect(read(header)).toEqual({ clipsExported: 2, warnings: ["A: effects require baking.", "B: 100% \u00e9"], omitted: 0 });
  });

  it("stays within the header budget and counts what it left out", () => {
    const warnings = Array.from({ length: 400 }, (_, index) => ({ message: `Clip ${index}: effects require baking and a long explanation.` }));
    const header = premiereReportHeader({ clipsExported: 400, warnings });
    const body = read(header);
    expect(header.length).toBeLessThanOrEqual(6000);
    expect(body.warnings.length).toBeGreaterThan(20);
    expect(body.warnings.length + body.omitted).toBe(400);
    expect(body.warnings[0]).toBe("Clip 0: effects require baking and a long explanation.");
  });
});
