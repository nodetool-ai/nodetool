import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { GameCaptureDifference } from "@nodetool-ai/game-renderer/node";

export async function writeGameGoldenDiagnostics(directory: string, name: string, reference: Uint8Array, actual: Uint8Array,
  difference: GameCaptureDifference, channelTolerance: number, report: string): Promise<void> {
  const first = await loadImage(Buffer.from(reference));
  const second = await loadImage(Buffer.from(actual));
  if (first.width !== second.width || first.height !== second.height) { throw new Error("Diagnostic capture dimensions changed"); }
  const canvas = createCanvas(first.width, first.height);
  const context = canvas.getContext("2d");
  context.drawImage(first, 0, 0);
  const expected = context.getImageData(0, 0, first.width, first.height).data;
  context.clearRect(0, 0, first.width, first.height);
  context.drawImage(second, 0, 0);
  const observed = context.getImageData(0, 0, first.width, first.height).data;
  const mask = context.createImageData(first.width, first.height);
  const rows = Array<number>(first.height).fill(0);
  let changedPixels = 0;
  let minX = first.width;
  let minY = first.height;
  let maxX = -1;
  let maxY = -1;
  for (let offset = 0; offset < observed.length; offset += 4) {
    let changed = false;
    for (let channel = 0; channel < 4; channel++) {
      if (Math.abs(observed[offset + channel] - expected[offset + channel]) > channelTolerance) { changed = true; break; }
    }
    mask.data[offset + 3] = 255;
    if (!changed) { continue; }
    mask.data[offset] = 255;
    const x = (offset / 4) % first.width;
    const y = Math.floor(offset / 4 / first.width);
    rows[y]++;
    changedPixels++;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  if (changedPixels !== difference.changedPixels || difference.width !== first.width || difference.height !== first.height) {
    throw new Error("Diagnostic mask disagrees with capture comparer");
  }
  context.putImageData(mask, 0, 0);
  const destination = join(directory, name);
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, "reference.png"), reference);
  await writeFile(join(destination, "actual.png"), actual);
  await writeFile(join(destination, "changed-pixels.png"), canvas.toBuffer("image/png"));
  await writeFile(join(destination, "diagnostic.json"), JSON.stringify({ ...difference, channelTolerance,
    bounds: changedPixels ? { minX, minY, maxX, maxY } : null, rows,
    referenceSha256: createHash("sha256").update(reference).digest("hex"), actualSha256: createHash("sha256").update(actual).digest("hex"),
    node: process.version, platform: process.platform, arch: process.arch, captureReport: report }, null, 2));
}
