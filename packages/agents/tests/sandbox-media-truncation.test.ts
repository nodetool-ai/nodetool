/**
 * Truncated image bytes must be refused, not handed to the native decoder.
 *
 * `@napi-rs/canvas` segfaults the host process on a truncated PNG (linux-x64)
 * and reports "Invalid SVG image" for it elsewhere — both reachable from guest
 * code, so `decodeImage` checks the container terminator first.
 */
import { describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { imageOps } from "../src/sandbox-media.js";

async function png(): Promise<Uint8Array> {
  const canvas = createCanvas(8, 8);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(0, 0, 8, 8);
  return new Uint8Array(await canvas.encode("png"));
}

describe("image decode guards", () => {
  it("reads a whole PNG", async () => {
    const info = (await imageOps.info(await png())) as {
      width: number;
      height: number;
    };
    expect(info.width).toBe(8);
    expect(info.height).toBe(8);
  });

  it("refuses a truncated PNG instead of decoding it", async () => {
    const bytes = await png();
    await expect(
      imageOps.info(bytes.subarray(0, Math.floor(bytes.length / 2)))
    ).rejects.toThrow(/incomplete/i);
  });

  it("refuses a PNG that is only its magic number", async () => {
    const bytes = (await png()).subarray(0, 8);
    await expect(imageOps.info(bytes)).rejects.toThrow(/incomplete/i);
  });

  it("names the truncation rather than blaming SVG", async () => {
    const bytes = await png();
    await expect(
      imageOps.info(bytes.subarray(0, bytes.length - 4))
    ).rejects.toThrow(/IEND/);
  });
});
