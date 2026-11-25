/**
 * Optional media-profile metadata on the rows of a custom OpenAI-compatible
 * `GET /models` listing, and the checks a request must pass against it.
 *
 * An endpoint may list the request shapes a model accepts:
 *
 * - `sizes`: exact output sizes as `"<width>x<height>"` strings.
 * - `aspect_ratios`: `"<w>:<h>"` strings.
 * - `resolutions`: preset names such as `"1K"` or `"720p"`.
 * - `durations`: clip lengths in seconds (video).
 * - `max_input_images`: the most source images an edit accepts (image).
 *
 * Every field is optional. A field that is missing or malformed declares
 * nothing, and the request goes out as it did before. A declared field narrows
 * the picker through the model's `aspectRatios`, `resolutions` and
 * `durations`, and a request outside it is refused before the endpoint is
 * called. A value is never swapped for a different size, duration or model.
 */

import { isNonEmptyString } from "@nodetool-ai/protocol";

export interface ListedMediaProfile {
  sizes?: string[];
  aspectRatios?: string[];
  resolutions?: string[];
  durations?: number[];
  maxInputImages?: number;
}

const SIZE_PATTERN = /^(\d{1,5})x(\d{1,5})$/;
const ASPECT_PATTERN = /^(\d{1,4}):(\d{1,4})$/;

function stringList(
  value: unknown,
  normalize: (s: string) => string | null
): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const item of value) {
    if (!isNonEmptyString(item)) continue;
    const normalized = normalize(item.trim());
    if (normalized && !out.includes(normalized)) out.push(normalized);
  }
  return out.length > 0 ? out : undefined;
}

function normalizeSize(value: string): string | null {
  const match = SIZE_PATTERN.exec(value.toLowerCase());
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? `${width}x${height}` : null;
}

function normalizeAspect(value: string): string | null {
  const match = ASPECT_PATTERN.exec(value.replaceAll(" ", ""));
  if (!match) return null;
  const w = Number(match[1]);
  const h = Number(match[2]);
  return w > 0 && h > 0 ? `${w}:${h}` : null;
}

function durationList(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: number[] = [];
  for (const item of value) {
    if (typeof item === "number" && Number.isFinite(item) && item > 0) {
      if (!out.includes(item)) out.push(item);
    }
  }
  return out.length > 0 ? out : undefined;
}

/** Read the optional media profile a listing row declares, if any. */
export function readListedMediaProfile(
  row: Record<string, unknown>
): ListedMediaProfile | undefined {
  const profile: ListedMediaProfile = {};
  const sizes = stringList(row.sizes, normalizeSize);
  if (sizes) profile.sizes = sizes;
  const aspectRatios = stringList(row.aspect_ratios, normalizeAspect);
  if (aspectRatios) profile.aspectRatios = aspectRatios;
  const resolutions = stringList(row.resolutions, (s) => s);
  if (resolutions) profile.resolutions = resolutions;
  const durations = durationList(row.durations);
  if (durations) profile.durations = durations;
  const maxInputImages = row.max_input_images;
  if (
    typeof maxInputImages === "number" &&
    Number.isInteger(maxInputImages) &&
    maxInputImages > 0
  ) {
    profile.maxInputImages = maxInputImages;
  }
  return Object.keys(profile).length > 0 ? profile : undefined;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function parseSize(size: string): [number, number] {
  const [w, h] = size.split("x").map(Number);
  return [w, h];
}

/** `"1280x720"` → `"16:9"`. */
export function aspectOfSize(size: string): string {
  const [w, h] = parseSize(size);
  const d = gcd(w, h);
  return `${w / d}:${h / d}`;
}

function reduceAspect(aspect: string): string | null {
  const normalized = normalizeAspect(aspect);
  if (!normalized) return null;
  const [w, h] = normalized.split(":").map(Number);
  const d = gcd(w, h);
  return `${w / d}:${h / d}`;
}

/** `"1280x720"` → `"720p"`: the short side, as video pickers name it. */
function videoResolutionOfSize(size: string): string {
  const [w, h] = parseSize(size);
  return `${Math.min(w, h)}p`;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/**
 * Aspect ratios the picker offers: the declared list, else the ratios of the
 * declared sizes.
 */
export function profileAspectRatios(
  profile: ListedMediaProfile
): string[] | undefined {
  if (profile.aspectRatios) return [...profile.aspectRatios];
  if (profile.sizes) return unique(profile.sizes.map(aspectOfSize));
  return undefined;
}

/**
 * Video resolutions the picker offers: the declared list, else the short side
 * of each declared size.
 */
export function profileVideoResolutions(
  profile: ListedMediaProfile
): string[] | undefined {
  if (profile.resolutions) return [...profile.resolutions];
  if (profile.sizes) return unique(profile.sizes.map(videoResolutionOfSize));
  return undefined;
}

function refuse(modelId: string, what: string, allowed: readonly unknown[]) {
  return new Error(
    `Model "${modelId}" does not accept ${what}. ` +
      `The endpoint lists: ${allowed.join(", ")}.`
  );
}

function sameText(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** The image request values a profile is checked against. */
export interface ImageProfileRequest {
  size: string | null;
  aspectRatio?: string | null;
  resolution?: string | null;
  inputImages?: number;
}

/**
 * Throw when an image request falls outside the declared profile. An unset
 * request value is not checked: the endpoint applies its own default.
 */
export function checkImageRequest(
  modelId: string,
  profile: ListedMediaProfile,
  request: ImageProfileRequest
): void {
  if (request.size && profile.sizes && !profile.sizes.includes(request.size)) {
    throw refuse(modelId, `size ${request.size}`, profile.sizes);
  }
  const aspects = profile.aspectRatios;
  if (aspects) {
    const requested = request.size
      ? aspectOfSize(request.size)
      : request.aspectRatio
        ? reduceAspect(request.aspectRatio)
        : null;
    if (
      requested &&
      !aspects.some((allowed) => reduceAspect(allowed) === requested)
    ) {
      throw refuse(modelId, `aspect ratio ${requested}`, aspects);
    }
  }
  if (
    request.resolution &&
    profile.resolutions &&
    !profile.resolutions.some((r) => sameText(r, request.resolution ?? ""))
  ) {
    throw refuse(
      modelId,
      `resolution ${request.resolution}`,
      profile.resolutions
    );
  }
  if (
    request.inputImages !== undefined &&
    profile.maxInputImages !== undefined &&
    request.inputImages > profile.maxInputImages
  ) {
    throw new Error(
      `Model "${modelId}" accepts at most ${profile.maxInputImages} input ` +
        `image${profile.maxInputImages === 1 ? "" : "s"}, ` +
        `got ${request.inputImages}.`
    );
  }
}

/** The video request values a profile is checked against. */
export interface VideoProfileRequest {
  aspectRatio?: string | null;
  resolution?: string | null;
  durationSeconds?: number | null;
  numFrames?: number | null;
}

/**
 * The exact values to send for a video request, or `undefined` for each one
 * the profile does not declare, so the caller keeps its usual behavior.
 */
export interface VideoProfileResolution {
  size?: string;
  seconds?: number;
}

function resolutionShortSide(resolution: string): number | null {
  const match = /^(\d{2,5})p$/i.exec(resolution.trim());
  return match ? Number(match[1]) : null;
}

/**
 * Check a video request against the declared profile and pick the exact size
 * and duration to send. Throws when a requested value is not declared.
 *
 * With declared `sizes`, the requested aspect ratio and resolution must name
 * one of them (`16:9` + `720p` names `1280x720`). With declared `durations`,
 * the requested duration must be one of them. When the request leaves a value
 * unset, the first declared one is sent.
 */
export function resolveVideoRequest(
  modelId: string,
  profile: ListedMediaProfile,
  request: VideoProfileRequest
): VideoProfileResolution {
  const aspect = request.aspectRatio ? reduceAspect(request.aspectRatio) : null;
  if (
    aspect &&
    profile.aspectRatios &&
    !profile.aspectRatios.some((allowed) => reduceAspect(allowed) === aspect)
  ) {
    throw refuse(modelId, `aspect ratio ${aspect}`, profile.aspectRatios);
  }
  const resolution = request.resolution?.trim() || null;
  if (
    resolution &&
    profile.resolutions &&
    !profile.resolutions.some((r) => sameText(r, resolution))
  ) {
    throw refuse(modelId, `resolution ${resolution}`, profile.resolutions);
  }

  const result: VideoProfileResolution = {};

  if (profile.sizes) {
    const shortSide = resolution ? resolutionShortSide(resolution) : null;
    const matches = profile.sizes.filter((size) => {
      if (aspect && aspectOfSize(size) !== aspect) return false;
      if (resolution && shortSide === null) {
        // A preset name the sizes cannot express, such as "1K", is matched
        // against the declared resolution list above and not here.
        return true;
      }
      if (shortSide !== null) {
        const [w, h] = parseSize(size);
        if (Math.min(w, h) !== shortSide) return false;
      }
      return true;
    });
    if (matches.length === 0) {
      const asked = [aspect, resolution].filter(Boolean).join(" at ");
      throw refuse(modelId, `size ${asked}`, profile.sizes);
    }
    result.size = matches[0];
  }

  if (profile.durations) {
    const requested =
      request.durationSeconds != null &&
      Number.isFinite(request.durationSeconds) &&
      request.durationSeconds > 0
        ? request.durationSeconds
        : request.numFrames != null &&
            Number.isFinite(request.numFrames) &&
            request.numFrames > 0
          ? Math.ceil(request.numFrames / 24)
          : null;
    if (requested === null) {
      result.seconds = profile.durations[0];
    } else if (profile.durations.includes(requested)) {
      result.seconds = requested;
    } else {
      throw refuse(
        modelId,
        `a ${requested}s duration`,
        profile.durations.map((d) => `${d}s`)
      );
    }
  }

  return result;
}
