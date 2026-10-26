import { readFile } from "node:fs/promises";
import { createCanvas } from "@napi-rs/canvas";
import { afterEach, expect, it, vi } from "vitest";
import { validateExportAudio, validateExportImage } from "../src/export-media.js";
import { musicWav } from "./fixtures/music-wav.js";

afterEach(() => { vi.unstubAllEnvs(); });

it.each(["png", "jpeg", "webp"] as const)("fully decodes valid %s pixels", async (format) => {
  const canvas = createCanvas(2, 2);
  canvas.getContext("2d").fillRect(0, 0, 2, 2);
  await expect(validateExportImage(canvas.toBuffer(`image/${format}`), format)).resolves.toBeUndefined();
});

it("decodes the complete existing two-minute streaming track", async () => {
  await expect(validateExportAudio(musicWav(), "wav")).resolves.toBeUndefined();
});

it("rejects a valid empty WAV and a truncated nonempty WAV", async () => {
  const empty = Buffer.from(musicWav().subarray(0, 44));
  empty.writeUInt32LE(36, 4);
  empty.writeUInt32LE(0, 40);
  await expect(validateExportAudio(empty, "wav")).rejects.toThrow(/decoded to nothing/);
  await expect(validateExportAudio(musicWav().subarray(0, 100), "wav")).rejects.toThrow(/decode/i);
});

it("rejects an aborted decoder request", async () => {
  const controller = new AbortController();
  const pending = validateExportAudio(musicWav(), "wav", controller.signal);
  controller.abort();
  await expect(pending).rejects.toThrow(/abort/i);
});


it.each(["ogg", "mp3"] as const)("decodes a valid %s stream", async (format) => {
  const bytes = await readFile(new URL(`./fixtures/export-tone.${format}`, import.meta.url));
  await expect(validateExportAudio(bytes, format)).resolves.toBeUndefined();
});
