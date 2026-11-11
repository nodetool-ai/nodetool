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

/**
 * Limits a shared Router schema states per model only in prose, which the
 * generated manifest cannot read. Each one is stated the same way by the
 * Router schema's field description and by the ComfyUI partner node that
 * calls the model (ComfyUI `comfy_api_nodes`, the commit in
 * docs/plans/comfy-cloud-model-audit.md). Where the two differ, the
 * ComfyUI node's range is used.
 */
const SEEDANCE_1_RESOLUTIONS = ["480p", "720p", "1080p"];
const SEEDANCE_2_FAST_RESOLUTIONS = ["480p", "720p"];
const SEEDANCE_2_RESOLUTIONS = ["480p", "720p", "1080p", "4k"];
// The Router also lists 9:21, which no ByteDance node offers.
const SEEDANCE_RATIOS: RouterParamSpec = {
  field: "ratio", source: "description", values: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"]
};
const KLING_2_DURATIONS: RouterParamSpec = { field: "duration", source: "description", values: ["5", "10"] };
const VEO_3_DURATIONS: RouterParamSpec = { field: "durationSeconds", source: "description", values: ["4", "6", "8"] };
const HAND_SPECS: Record<string, RouterManifestEntry["params"]> = {
  // Router: "Seedance 2.5: [4,30]"; ByteDance2 nodes: 4-30.
  "byteplus/dreamina-seedance-2-5-260628": {
    duration: { field: "duration", source: "description", min: 4, max: 30 },
    resolution: { field: "resolution", source: "description", values: SEEDANCE_2_RESOLUTIONS },
    aspectRatio: SEEDANCE_RATIOS
  },
  // Router: "Seedance 2.0, 2.0 fast & 2.0 mini: [4,15]"; ByteDance2 nodes agree. The Router says 2.0
  // lacks 1080p, while ByteDance2 nodes offer it 480p to 4k. Fast and mini stop at 720p in both.
  "byteplus/dreamina-seedance-2-0-260128": {
    duration: { field: "duration", source: "description", min: 4, max: 15 },
    resolution: { field: "resolution", source: "description", values: SEEDANCE_2_RESOLUTIONS },
    aspectRatio: SEEDANCE_RATIOS
  },
  "byteplus/dreamina-seedance-2-0-fast-260128": {
    duration: { field: "duration", source: "description", min: 4, max: 15 },
    resolution: { field: "resolution", source: "description", values: SEEDANCE_2_FAST_RESOLUTIONS },
    aspectRatio: SEEDANCE_RATIOS
  },
  "byteplus/dreamina-seedance-2-0-mini": {
    duration: { field: "duration", source: "description", min: 4, max: 15 },
    resolution: { field: "resolution", source: "description", values: SEEDANCE_2_FAST_RESOLUTIONS },
    aspectRatio: SEEDANCE_RATIOS
  },
  // Router: "Seedance 1.5 pro: [4,12]"; ByteDance nodes: 3-12 and refuse 1.5 pro below 4.
  "byteplus/seedance-1-5-pro-251215": {
    duration: { field: "duration", source: "description", min: 4, max: 12 },
    resolution: { field: "resolution", source: "description", values: SEEDANCE_1_RESOLUTIONS },
    aspectRatio: SEEDANCE_RATIOS
  },
  // Router: "Seedance 1.0: [2,12]"; ByteDance nodes: 3-12.
  "byteplus/seedance-1-0-pro-250528": {
    duration: { field: "duration", source: "description", min: 3, max: 12 },
    resolution: { field: "resolution", source: "description", values: SEEDANCE_1_RESOLUTIONS },
    aspectRatio: SEEDANCE_RATIOS
  },
  "byteplus/seedance-1-0-pro-fast-251015": {
    duration: { field: "duration", source: "description", min: 3, max: 12 },
    resolution: { field: "resolution", source: "description", values: SEEDANCE_1_RESOLUTIONS },
    aspectRatio: SEEDANCE_RATIOS
  },
  // Router: "Veo 3/3.1: 4, 6, or 8" (the manifest read the Veo 2 range); Veo3 nodes: 4-8 in steps of 2.
  "veo/veo-3.1-generate-001": { duration: VEO_3_DURATIONS },
  "veo/veo-3.1-fast-generate-001": { duration: VEO_3_DURATIONS },
  // Veo3 nodes refuse 4k on lite; the shared Router schema lists it.
  "veo/veo-3.1-lite-generate-001": {
    duration: VEO_3_DURATIONS,
    resolution: { field: "resolution", source: "description", values: ["720p", "1080p"] }
  },
  // Kling 2.6 and 2.5 Turbo nodes: 5 or 10 s. The shared Router schema lists 3-15.
  "kling/kling-v2-6": { duration: KLING_2_DURATIONS },
  "kling/kling-v2-5-turbo": { duration: KLING_2_DURATIONS },
  // MiniMax H3 Max nodes: 5-15 s.
  "fal/h3-max": { duration: { field: "duration", source: "description", min: 5, max: 15 } },
  "fal/h3-max-turbo": { duration: { field: "duration", source: "description", min: 5, max: 15 } },
  // LumaRay32 nodes: six aspect ratios; the Router lists twelve.
  "luma_2/ray-3.2": {
    resolution: { field: "resolution", source: "enum", values: ["360p", "540p", "720p", "1080p"] },
    aspectRatio: { field: "aspect_ratio", source: "description", values: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"] },
    duration: { field: "duration", source: "enum", values: ["5s", "10s"] }
  }
};

const specFor = (modelId: string, param: RouterParam): RouterParamSpec | undefined =>
  HAND_SPECS[modelId]?.[param] ?? COMFY_ROUTER_MANIFEST[modelId]?.params[param];

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
