/**
 * Applies the generated Comfy Router manifest to a request and to the model
 * listing. The router accepts a bad value and fails the job later with an
 * `invalid_input` that names no field, so a value is corrected here. A value
 * the model does not accept at all is dropped, because a node always sends its
 * own default and the model's default is the better result.
 */
import { createLogger } from "@nodetool-ai/config";

import {
  COMFY_ROUTER_MANIFEST,
  type RouterManifestEntry,
  type RouterParamSpec
} from "./comfy-router-manifest.js";

const log = createLogger("nodetool.runtime.comfy-router");

type RouterParam = keyof RouterManifestEntry["params"];

const specFor = (modelId: string, param: RouterParam): RouterParamSpec | undefined =>
  COMFY_ROUTER_MANIFEST[modelId]?.params[param];

/** The model's spelling of a value, or undefined when it does not accept it. */
export function acceptedValue(
  modelId: string,
  param: "resolution" | "aspectRatio",
  value: string | null | undefined
): string | null | undefined {
  const values = specFor(modelId, param)?.values;
  if (!value || !values) return value;
  const wanted = value.toLowerCase();
  const accepted =
    values.find((candidate) => candidate === value) ??
    values.find((candidate) => candidate.toLowerCase() === wanted);
  if (accepted === undefined) {
    log.warn(`${modelId} does not accept ${param} ${value}. The model's default applies.`);
  }
  return accepted;
}

/** A `width` and `height` as the model's size field takes them, inside its pixel area. */
export function acceptedSize(modelId: string, width: number, height: number): string {
  const spec = specFor(modelId, "size");
  let [w, h] = [width, height];
  if (spec?.pixelArea) {
    const [min, max] = spec.pixelArea;
    const area = w * h;
    if (area > max) {
      const scale = Math.sqrt(max / area);
      [w, h] = [Math.floor(w * scale), Math.floor(h * scale)];
    } else if (area < min) {
      const scale = Math.sqrt(min / area);
      [w, h] = [Math.ceil(w * scale), Math.ceil(h * scale)];
    }
  }
  return `${w}${spec?.separator ?? "x"}${h}`;
}

const seconds = (value: string): number => Number.parseFloat(value);

/** The accepted duration nearest to the one asked for. */
export function acceptedDuration(modelId: string, duration: number): number | string {
  const spec = specFor(modelId, "duration");
  if (!spec) return duration;
  const numeric = spec.values?.filter((value) => Number.isFinite(seconds(value)));
  if (numeric && numeric.length > 0) {
    return numeric.reduce((best, value) =>
      Math.abs(seconds(value) - duration) < Math.abs(seconds(best) - duration) ? value : best
    );
  }
  return Math.min(spec.max ?? duration, Math.max(spec.min ?? duration, duration));
}

const MAX_ANNOUNCED_DURATIONS = 30;

/** What a model picker may offer for this model. Unknown options stay unset. */
export function announcedOptions(modelId: string): {
  aspectRatios?: string[];
  resolutions?: string[];
  durations?: number[];
} {
  const aspect = specFor(modelId, "aspectRatio")?.values?.filter((value) => /^\d+:\d+$/.test(value));
  const resolution = specFor(modelId, "resolution")?.values;
  const duration = specFor(modelId, "duration");
  const listed = duration?.values?.map(seconds).filter(Number.isFinite);
  const { min, max } = duration ?? {};
  const durations =
    listed && listed.length > 0
      ? listed
      : min !== undefined && max !== undefined && max - min < MAX_ANNOUNCED_DURATIONS
        ? Array.from({ length: Math.floor(max - min) + 1 }, (_, index) => min + index)
        : undefined;
  return {
    ...(aspect && aspect.length > 0 && { aspectRatios: aspect }),
    // Pickers and nodes name these tiers in capitals: 2K, not 2k.
    ...(resolution && {
      resolutions: [...new Set(resolution.map((value) => value.replace(/^(\d+(?:\.\d+)?)k$/, "$1K")))]
    }),
    ...(durations && { durations })
  };
}
