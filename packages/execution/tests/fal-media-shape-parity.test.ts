/**
 * The live fal path and durable recovery must agree on which response shapes
 * carry media. A shape the live provider downloads but the decoder calls
 * structured is marked ready with no asset, which completes a paid generation
 * with nothing saved.
 *
 * This audit reads the field names the live extractors take off a fal result
 * and fails when the recovery decoder does not know one. Like
 * `generation-seam-audit.test.ts`, it asserts it inspected something, so it
 * cannot pass by matching nothing.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  decodeFalOutputs,
  FAL_MEDIA_ENVELOPE_KEYS,
  FAL_MEDIA_URL_ALIAS_KEYS,
  FAL_MEDIA_URL_FIELDS
} from "../src/fal-output-decoder.js";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const FAL_PROVIDER = join(
  REPO_ROOT,
  "packages/runtime/src/providers/fal-provider.ts"
);

/** The live extractors whose accepted shapes recovery has to match. */
const EXTRACTORS = [
  "extractImageUrls",
  "extractVideoUrl",
  "extractAudioUrl"
] as const;

function extractorBody(source: string, name: string): string {
  const start = source.indexOf(`export function ${name}(`);
  expect(
    start,
    `${name} is no longer exported from fal-provider.ts`
  ).toBeGreaterThan(-1);
  const end = source.indexOf("\n}", start);
  expect(end, `${name} has no closing brace`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("fal media shape parity", () => {
  const source = readFileSync(FAL_PROVIDER, "utf8");
  const known = new Set<string>([
    ...FAL_MEDIA_ENVELOPE_KEYS,
    ...FAL_MEDIA_URL_ALIAS_KEYS,
    ...FAL_MEDIA_URL_FIELDS
  ]);

  it("knows every result field the live extractors read", () => {
    const fields = new Set<string>();
    for (const name of EXTRACTORS) {
      for (const match of extractorBody(source, name).matchAll(
        /\bresult\.([a-z_][a-z0-9_]*)/giu
      )) {
        fields.add(match[1]);
      }
    }
    // The shapes documented in the extractors today. A failure here means the
    // provider learned a response shape recovery would silently drop.
    expect([...fields].sort()).toEqual([
      "audio",
      "audio_url",
      "image",
      "images",
      "url",
      "video",
      "video_url",
      "videos"
    ]);
    expect([...fields].filter((field) => !known.has(field))).toEqual([]);
  });

  it.each(["audio_url", "video_url", "image_url"])(
    "decodes a flat %s response as media",
    (key) => {
      const outputs = decodeFalOutputs({ [key]: "https://fal.media/out.bin" });

      expect(outputs).toHaveLength(1);
      expect(outputs[0]).toMatchObject({
        outputKey: key,
        outputType: "media",
        providerRef: "https://fal.media/out.bin"
      });
    }
  );

  it("saves a flat alias beside its envelope only once", () => {
    const outputs = decodeFalOutputs({
      video: { url: "https://fal.media/clip.mp4" },
      video_url: "https://fal.media/clip.mp4",
      seed: 7
    });

    expect(
      outputs.filter((output) => output.outputType === "media")
    ).toHaveLength(1);
    expect(outputs[1]).toMatchObject({
      outputKey: "structured",
      rawResult: { seed: 7 }
    });
  });

  it("keeps a distinct alias URL as its own output", () => {
    const outputs = decodeFalOutputs({
      audio: { url: "https://fal.media/speech.mp3" },
      audio_url: "https://fal.media/speech.wav"
    });

    expect(outputs.map((output) => output.providerRef)).toEqual([
      "https://fal.media/speech.mp3",
      "https://fal.media/speech.wav"
    ]);
  });
});
