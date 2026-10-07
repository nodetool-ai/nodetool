import { createCanvas } from "@napi-rs/canvas";
import { expect, it } from "vitest";
import { compareGameCaptures } from "../src/imageDiff.js";

function solidImage(color: string): Uint8Array {
  const canvas = createCanvas(8, 8);
  const context = canvas.getContext("2d");
  context.fillStyle = color;
  context.fillRect(0, 0, 8, 8);
  return canvas.toBuffer("image/png");
}

it("accepts channel drift inside the tolerance and detects deliberate image corruption", async () => {
  const reference = solidImage("#eeeeee");
  expect((await compareGameCaptures(reference, solidImage("#e0e0e0"), 16)).changedFraction).toBe(0);
  expect((await compareGameCaptures(reference, solidImage("#000000"), 16)).changedFraction).toBe(1);
  await expect(compareGameCaptures(reference, reference, -1)).rejects.toThrow("tolerance");
});
