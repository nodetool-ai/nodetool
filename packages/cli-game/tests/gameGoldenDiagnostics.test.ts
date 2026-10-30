import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { afterEach, expect, it } from "vitest";
import { compareGameCaptures } from "@nodetool-ai/game-renderer/node";
import { writeGameGoldenDiagnostics } from "./gameGoldenDiagnostics.js";

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) { await rm(directory, { recursive: true, force: true }); } });
function image(changes: Array<{ x: number; y: number; channel: number; value: number }> = []): Uint8Array {
  const canvas = createCanvas(4, 3);
  const context = canvas.getContext("2d");
  context.fillStyle = "#000000"; context.fillRect(0, 0, 4, 3);
  const pixels = context.getImageData(0, 0, 4, 3);
  for (const change of changes) { pixels.data[(change.y * 4 + change.x) * 4 + change.channel] = change.value; }
  context.putImageData(pixels, 0, 0);
  return canvas.toBuffer("image/png");
}
async function record(actual: Uint8Array): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "golden-diagnostics-test-")); directories.push(directory);
  const reference = image();
  await writeGameGoldenDiagnostics(directory, "case", reference, actual, await compareGameCaptures(reference, actual, 16), 16, '{"tick":60}');
  return join(directory, "case");
}
it("retains actual and reference captures after the capture source directory is removed", async () => {
  const actual = image([{ x: 2, y: 1, channel: 0, value: 255 }]);
  const source = await mkdtemp(join(tmpdir(), "golden-capture-source-"));
  await writeFile(join(source, "actual.png"), actual);
  let directory: string;
  try { directory = await record(await readFile(join(source, "actual.png"))); }
  finally { await rm(source, { recursive: true, force: true }); }
  expect(await readFile(join(directory, "actual.png"))).toEqual(Buffer.from(actual));
  expect(await readFile(join(directory, "reference.png"))).toEqual(Buffer.from(image()));
  expect(JSON.parse(await readFile(join(directory, "diagnostic.json"), "utf8"))).toMatchObject({ changedPixels: 1, bounds: { minX: 2, minY: 1, maxX: 2, maxY: 1 }, rows: [0, 1, 0] });
  const mask = await loadImage(await readFile(join(directory, "changed-pixels.png")));
  expect([mask.width, mask.height]).toEqual([4, 3]);
  const canvas = createCanvas(mask.width, mask.height);
  const context = canvas.getContext("2d"); context.drawImage(mask, 0, 0);
  expect([...context.getImageData(2, 1, 1, 1).data]).toEqual([255, 0, 0, 255]);
  expect([...context.getImageData(0, 0, 1, 1).data]).toEqual([0, 0, 0, 255]);
});
it("reports no changed bounds for identical captures", async () => {
  const directory = await record(image());
  expect(JSON.parse(await readFile(join(directory, "diagnostic.json"), "utf8"))).toMatchObject({ changedPixels: 0, bounds: null, rows: [0, 0, 0] });
});
it("uses any RGBA channel strictly above tolerance and inclusive separated bounds", async () => {
  const directory = await record(image([{ x: 0, y: 0, channel: 0, value: 16 }, { x: 1, y: 0, channel: 1, value: 17 }, { x: 3, y: 2, channel: 3, value: 200 }]));
  expect(JSON.parse(await readFile(join(directory, "diagnostic.json"), "utf8"))).toMatchObject({ changedPixels: 2, bounds: { minX: 1, minY: 0, maxX: 3, maxY: 2 }, rows: [1, 0, 1] });
  const mask = await loadImage(await readFile(join(directory, "changed-pixels.png")));
  const canvas = createCanvas(mask.width, mask.height);
  const context = canvas.getContext("2d"); context.drawImage(mask, 0, 0);
  expect([...context.getImageData(0, 0, 1, 1).data]).toEqual([0, 0, 0, 255]);
  expect([...context.getImageData(1, 0, 1, 1).data]).toEqual([255, 0, 0, 255]);
  expect([...context.getImageData(3, 2, 1, 1).data]).toEqual([255, 0, 0, 255]);
});
it("rejects inconsistent comparer counts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "golden-diagnostics-test-")); directories.push(directory);
  await expect(writeGameGoldenDiagnostics(directory, "case", image(), image(), { width: 4, height: 3, changedPixels: 1, changedFraction: 1 / 12 }, 16, "")).rejects.toThrow("disagrees");
});
it("rejects dimension changes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "golden-diagnostics-test-")); directories.push(directory);
  const actual = createCanvas(1, 1).toBuffer("image/png");
  await expect(writeGameGoldenDiagnostics(directory, "case", image(), actual, { width: 4, height: 3, changedPixels: 1, changedFraction: 1 / 12 }, 16, "")).rejects.toThrow("dimensions");
});
