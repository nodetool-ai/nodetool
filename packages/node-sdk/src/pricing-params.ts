/**
 * Read what a node states about the job it will run — duration, resolution,
 * audio — off its property values, in the vocabulary the price catalogs bill
 * in. The sibling of the fan-out property list: both turn node data into the
 * numbers `estimateWorkflowCost` multiplies.
 *
 * Pure and lenient in, strict out: a property we do not recognize, or a value
 * we cannot read, leaves the field unset. Unset is priced at the model's base
 * spec with an assumption the user can see; a guessed tier would be an invented
 * number nobody can audit.
 *
 * ## Property-name census (2026-08-12)
 *
 * Counted over the shipped generator manifests — `packages/fal-nodes`
 * (`fal-manifest.json`), `packages/replicate-nodes` (`replicate-manifest.json`),
 * `packages/kie-nodes` (`kie-manifest.json`) — as distinct `inputFields[].name`
 * occurrences, plus the hand-written `@prop` declarations in
 * `packages/video-nodes` and `packages/image-nodes`:
 *
 * | name | manifests | note |
 * |---|---|---|
 * | `duration` | 307 | also `nodetool.video.TextToVideo`/`ImageToVideo` (int seconds) |
 * | `num_frames` | 183 | with `fps` (94) / `frames_per_second` (74) |
 * | `duration_seconds` | 1 | the name the video nodes pass to providers |
 * | `seconds` | 2 | |
 * | `video_length` | 1 | |
 * | `duration_sec`, `max_duration`, `music_duration` | 1 each | not read: not the billed output length |
 * | `resolution` | 387 | also the video nodes (`720p`…`4K`) |
 * | `image_size` | 316 | `square_hd`, `1024x1024`, `1K`, `auto`, … |
 * | `size` | 26 | `1024x1024`, `1280*720`, `2K` |
 * | `quality` | 23 | mostly `high`/`auto`; one node uses `540p` |
 * | `width` / `height` | 79 / 79 | |
 * | `video_size` | 49 | not read: an aspect-ratio name on every node carrying it |
 * | `generate_audio` | 139 | plus `generate_audio_switch` (18), `audio_enabled` (1) |
 * | `with_audio` | 1 | |
 * | `audio` | 184 | **not read**: on all but a handful it is an audio *input* ref |
 *
 * `video_duration` and `num_seconds` from the plan's draft list ship on **no**
 * node and are omitted. `audio` is likewise omitted: 184 occurrences and nearly
 * all of them are `audio: AudioRef` inputs, so reading it as a billing axis
 * would flip models to their dearer audio rung on a property that means
 * something else. `generate_audio` / `generate_audio_switch` / `audio_enabled` /
 * `with_audio` are the booleans that really name the axis.
 */

import type { ModelPriceParams } from "./cost-estimate.js";
import { isBoolean, isNumber, isString } from "./type-predicates.js";

/** Duration properties, most specific first. The first present value wins. */
const DURATION_PROPERTIES = [
  "duration",
  "duration_seconds",
  "seconds",
  "num_seconds",
  "video_length",
  "video_duration"
] as const;

/** Resolution-ish properties, most specific first. */
const RESOLUTION_PROPERTIES = ["resolution", "image_size", "size", "quality"] as const;

/** Booleans that name the audio billing axis (never `audio`, an input ref). */
const AUDIO_PROPERTIES = [
  "generate_audio",
  "generate_audio_switch",
  "audio_enabled",
  "with_audio"
] as const;

/** Frame-rate properties paired with `num_frames`. */
const FPS_PROPERTIES = ["fps", "frames_per_second", "frame_rate"] as const;

/** A finite positive number from a number or a string like `"5"` / `"5s"`. */
function readSeconds(value: unknown): number | undefined {
  if (isNumber(value)) {
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }
  if (!isString(value)) return undefined;
  // Trim and collapse runs before matching: adjacent unbounded whitespace
  // quantifiers around an optional group backtrack polynomially (CodeQL).
  const compact = value.trim().replace(/\s+/g, " ");
  const match = /^(\d+(?:\.\d+)?) ?(?:s|secs?|seconds)?$/i.exec(compact);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function readPositiveNumber(value: unknown): number | undefined {
  const parsed = isString(value) ? Number(value.trim()) : value;
  return isNumber(parsed) && Number.isFinite(parsed) && parsed > 0
    ? parsed
    : undefined;
}

/**
 * The pixel tiers the catalogs price image models at. A `width × height` pair
 * lands on the nearest one by total pixels, but only inside a 1.5× band —
 * beyond that we would be naming a tier the provider never quoted.
 */
const PIXEL_TIERS: Array<{ pixels: number; tier: string }> = [
  { pixels: 512 * 512, tier: "512x512" },
  { pixels: 1024 * 1024, tier: "1024x1024" },
  { pixels: 2048 * 2048, tier: "2K" },
  { pixels: 4096 * 4096, tier: "4K" }
];

/** The tier a pixel count sits closest to, or undefined when it sits far off. */
function tierForPixels(pixels: number): string | undefined {
  let best = PIXEL_TIERS[0];
  let bestRatio = Infinity;
  for (const candidate of PIXEL_TIERS) {
    const ratio =
      pixels > candidate.pixels ? pixels / candidate.pixels : candidate.pixels / pixels;
    if (ratio < bestRatio) {
      bestRatio = ratio;
      best = candidate;
    }
  }
  return bestRatio <= 1.5 ? best.tier : undefined;
}

/**
 * A stated resolution, passed through as the raw spelling for the calculator to
 * normalize. Names that carry no resolution at all (`auto`, `square_hd`,
 * `high`) return undefined, which prices at the base spec instead of guessing.
 */
function readResolution(value: unknown): string | undefined {
  if (isNumber(value)) {
    return Number.isFinite(value) && value > 0 ? String(value) : undefined;
  }
  if (!isString(value)) return undefined;
  const text = value.trim();
  if (!text) return undefined;
  // `1280*720` / `768x512`: a pixel pair, not a tier name.
  const pair = /^(\d+)\s*[x*×]\s*(\d+)$/i.exec(text);
  if (pair) {
    const pixels = Number(pair[1]) * Number(pair[2]);
    return pixels > 0 ? tierForPixels(pixels) : undefined;
  }
  // `720p`, `4K`, `1MP`, `1024` — spellings the calculator's tier table knows.
  if (/^(\d+(\.\d+)?)\s*(p|k|mp)?$/i.test(text)) return text;
  return undefined;
}

/**
 * Read the pricing-relevant parameters off a node's property values. Pass the
 * property bag (`node.data.properties` in the editor, `node.data` on the
 * server's flat shape) — unknown keys are ignored.
 */
export function extractPricingParams(
  values: Record<string, unknown> | undefined | null
): ModelPriceParams {
  const params: ModelPriceParams = {};
  if (!values) return params;

  for (const name of DURATION_PROPERTIES) {
    const seconds = readSeconds(values[name]);
    if (seconds !== undefined) {
      params.seconds = seconds;
      break;
    }
  }
  if (params.seconds === undefined) {
    const frames = readPositiveNumber(values.num_frames);
    const fps = FPS_PROPERTIES.map((name) => readPositiveNumber(values[name])).find(
      (value) => value !== undefined
    );
    if (frames !== undefined && fps !== undefined) {
      params.seconds = frames / fps;
    }
  }

  for (const name of RESOLUTION_PROPERTIES) {
    const resolution = readResolution(values[name]);
    if (resolution !== undefined) {
      params.resolution = resolution;
      break;
    }
  }
  if (params.resolution === undefined) {
    const width = readPositiveNumber(values.width);
    const height = readPositiveNumber(values.height);
    if (width !== undefined && height !== undefined) {
      const tier = tierForPixels(width * height);
      if (tier !== undefined) params.resolution = tier;
    }
  }

  for (const name of AUDIO_PROPERTIES) {
    const value = values[name];
    if (isBoolean(value)) {
      params.withAudio = value;
      break;
    }
  }

  return params;
}

export default extractPricingParams;
