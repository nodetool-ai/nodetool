/**
 * RenderText over an image whose decode warns.
 *
 * sharp defaults to `failOn: "warning"`, which turns a recoverable decode
 * warning into a thrown error. Every other sharp call in the image nodes opens
 * user-supplied bytes with `failOn: "none"`; the three in RenderText did not,
 * so a JPEG with an intact header and a truncated scan — what a partial upload
 * or a stream cut short produces — failed the whole node with
 * "Warning treated as error due to failOn setting".
 */
import { describe, it, expect } from "vitest";
import sharp from "sharp";

/** A JPEG that decodes with a warning: header intact, scan cut short. */
async function truncatedScanJpeg(): Promise<Buffer> {
  const whole = await sharp({
    create: { width: 64, height: 64, channels: 3, background: "#888888" }
  })
    .jpeg()
    .toBuffer();
  return whole.subarray(0, whole.length - 8);
}

describe("RenderText input tolerance", () => {
  it("opens a warning-level JPEG the way the rest of the image nodes do", async () => {
    const bytes = await truncatedScanJpeg();

    await expect(sharp(bytes).png().toBuffer()).rejects.toThrow(
      /premature end of JPEG/
    );

    const out = await sharp(bytes, { failOn: "none" }).png().toBuffer();
    expect(out.length).toBeGreaterThan(0);
  });

  it("composites text onto that image without failing the node", async () => {
    const bytes = await truncatedScanJpeg();
    const md = await sharp(bytes, { failOn: "none" }).metadata();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${md.width}" height="${md.height}"><text x="4" y="20" font-size="16">hi</text></svg>`;

    const out = await sharp(bytes, { failOn: "none" })
      .composite([{ input: Buffer.from(svg) }])
      .png()
      .toBuffer();

    expect(out.length).toBeGreaterThan(0);
  });
});
