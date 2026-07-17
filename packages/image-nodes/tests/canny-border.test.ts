/**
 * Regression test for the Canny border-frame bug.
 *
 * The Gaussian pre-blur used to skip the outer 2px of the image, leaving a zero
 * frame that the Sobel pass read against the real interior as a spurious edge
 * just inside the border. On a uniform image Canny must produce no edges
 * anywhere — including within 3px of every border.
 */
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { LIB_IMAGE_FILTER_NODES } from "@nodetool-ai/image-nodes";
import { RAW_RGBA_MIME } from "@nodetool-ai/protocol";

/** Build a uniform-gray image as a base64 PNG image ref. */
async function makeUniformImage(
  w = 16,
  h = 16,
  gray = 128
): Promise<Record<string, unknown>> {
  const buf = await sharp({
    create: { width: w, height: h, channels: 3, background: { r: gray, g: gray, b: gray } }
  })
    .png()
    .toBuffer();
  return { type: "image", data: buf.toString("base64"), uri: "" };
}

function findNode(suffix: string) {
  const cls = (LIB_IMAGE_FILTER_NODES as readonly { nodeType?: string }[]).find(
    (n) => n.nodeType?.endsWith(suffix)
  );
  if (!cls) throw new Error(`Node ending with "${suffix}" not found`);
  return cls as unknown as {
    new (): {
      assign(p: Record<string, unknown>): void;
      process(): Promise<Record<string, unknown>>;
    };
  };
}

describe("Canny border frame", () => {
  it("produces no edge pixels on a uniform image, including near the border", async () => {
    const w = 16;
    const h = 16;
    const img = await makeUniformImage(w, h, 128);
    const Cls = findNode(".Canny");
    const node = new Cls();
    node.assign({ image: img, low_threshold: 100, high_threshold: 200 });
    const output = (await node.process()).output as Record<string, unknown>;

    expect(output.mimeType).toBe(RAW_RGBA_MIME);
    expect(output.width).toBe(w);
    expect(output.height).toBe(h);
    const rgba = output.data as Uint8Array;
    expect(rgba.length).toBe(w * h * 4);

    // Every pixel must be black (no edge) — the border frame bug lit up pixels
    // within 3px of the edge.
    let litPixels = 0;
    for (let i = 0; i < w * h; i++) {
      if (rgba[i * 4] !== 0) litPixels++;
    }
    expect(litPixels).toBe(0);
  });
});
