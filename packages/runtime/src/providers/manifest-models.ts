/**
 * Load image / video model lists from node-package manifests.
 *
 * Each provider's node package ships a manifest JSON describing every node
 * (endpoint, class name, output type, etc.).  This module extracts and
 * deduplicates the image and video entries so providers don't need to
 * maintain hardcoded model lists.
 */

import { createLogger, loadPackageAssetJson } from "@nodetool-ai/config";
import type { ImageModel, MusicModel, TTSModel, VideoModel } from "./types.js";
import { isNumber } from "../type-predicates.js";

// Stryker disable next-line StringLiteral: logger name is diagnostic, not asserted.
const log = createLogger("nodetool.runtime.providers.manifest-models");

// ---------------------------------------------------------------------------
// Manifest entry shapes — union of Kie / FAL / Replicate conventions
// ---------------------------------------------------------------------------

interface ManifestInputField {
  name: string;
  apiParamName?: string;
  propType: string;
  enumValues?: string[];
  /** Whether the endpoint refuses the call without this field. */
  required?: boolean;
}

/**
 * Kie-style input field. The field `name` IS the API param name, `type` is a
 * lowercase primitive ("str" | "enum" | "int" | "float" | "bool"), and enum
 * options live in `values` (not `enumValues`).
 */
interface ManifestField {
  name: string;
  type: string;
  values?: string[];
  default?: unknown;
  required?: boolean;
  min?: number;
  max?: number;
  /** AtlasCloud: send this field inside the named `{url, type}` array instead. */
  wrapInto?: string;
}

/**
 * Kie-style validation rule. `not_empty` is the endpoint saying, in the
 * manifest, that it refuses a blank value for that field — the kie node factory
 * checks these before spending an API call.
 */
interface ManifestValidation {
  field: string;
  rule: string;
  message?: string;
}

/** Kie-style asset upload descriptor (carries the real API param name). */
interface ManifestUpload {
  field: string;
  kind?: string;
  isList?: boolean;
  paramName?: string;
  groupKey?: string;
}

interface ManifestNode {
  /** Kie uses modelId */
  modelId?: string;
  /** FAL / Replicate use endpointId */
  endpointId?: string;
  /** Kie uses title as the human-readable name */
  title?: string;
  /** FAL / Replicate use className as the human-readable name */
  className?: string;
  /** "image" | "video" | "audio" | ... */
  outputType?: string;
  /** FAL groups nodes by source module, e.g. "text_to_speech". */
  moduleName?: string;
  /** Free-form capability tags, e.g. ["audio", "music", "text-to-audio"]. */
  tags?: string[];
  /** Explicit task set declared by manifests that know model capabilities. */
  supportedTasks?: string[];
  /** FAL ships per-endpoint input schemas; used to derive option constraints. */
  inputFields?: ManifestInputField[];
  /** Kie ships per-endpoint input schemas under `fields` (name is the API param). */
  fields?: ManifestField[];
  /** Kie ships asset upload descriptors (field → API param mapping). */
  uploads?: ManifestUpload[];
  /** Kie ships per-endpoint validation rules the node factory enforces. */
  validation?: ManifestValidation[];
  /** Kie: routes the model through the Suno music API. */
  useSuno?: boolean;
  /** Kie: Suno API endpoint path for this model. */
  sunoEndpoint?: string;
  /** Kie: poll interval (ms) while waiting on the async task. */
  pollInterval?: number;
  /** Kie: maximum poll attempts before giving up. */
  maxAttempts?: number;
}

export function explicitTasks(n: ManifestNode): string[] | undefined {
  return Array.isArray(n.supportedTasks) && n.supportedTasks.length > 0
    ? n.supportedTasks
    : undefined;
}

/**
 * Enum values declared for a manifest input field, by canonical API name.
 * Reads both the FAL/Replicate `inputFields` (`apiParamName ?? name` →
 * `enumValues`) and the Kie `fields` (`name` → `values`) conventions.
 *
 * Values are stringified rather than returned as read: the manifests are JSON
 * and the declared `string[]` is a claim about them, not a guarantee. FAL's
 * two LoRA trainers declare `resolution` as an enum of numbers (768/1024 and
 * 512/1024), which reached `unifiedModel.resolutions` — `z.array(z.string())`
 * — and failed output validation for the whole `models.imageByProvider`
 * query. `videoConstraints` reads durations back with `Number()`, so a
 * numeric enum still works there.
 */
export function enumValuesFor(
  n: ManifestNode,
  apiName: string
): string[] | undefined {
  // Stryker disable next-line ArrayDeclaration: the fallback's contents are irrelevant — a non-array node yields no matching field either way.
  const inputField = (n.inputFields ?? []).find(
    (f) => (f.apiParamName ?? f.name) === apiName
  );
  const fromInput = inputField?.enumValues;
  if (fromInput && fromInput.length > 0) return fromInput.map(String);
  // Stryker disable next-line ArrayDeclaration: same rationale — a non-array node yields no matching field either way.
  const field = (n.fields ?? []).find((f) => f.name === apiName);
  const fromField = field?.values;
  return fromField && fromField.length > 0 ? fromField.map(String) : undefined;
}

/**
 * Seconds from one declared duration option.
 *
 * The manifests spell a clip length three ways, because the providers do:
 * a bare number (`8`), a numeric string (`"8"`), and — across the FAL Veo and
 * Marey families — a unit-suffixed string (`"8s"`). A bare `Number("8s")` is
 * `NaN`, so the suffixed spelling used to drop the whole enum and leave those
 * endpoints looking unconstrained: 22 FAL video endpoints, the Veo 3.1
 * image-to-video and first-last-frame families among them, offered the app's
 * full duration ladder when FAL sells them only 4, 6 and 8 seconds.
 *
 * Only a plain count of seconds is read. `"auto"` (FAL's Seedance rows) and
 * `-1` (AtlasCloud's) name no length, and neither does a range or a frame
 * count, so they stay out rather than becoming a number nothing published.
 */
function durationSeconds(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const digits = /^(\d+(?:\.\d+)?)\s*s(?:ec(?:onds?)?)?$/i.exec(trimmed)?.[1] ?? trimmed;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Option constraints (duration/resolution/aspect) for a video endpoint. */
export function videoConstraints(n: ManifestNode) {
  const durationEnum = enumValuesFor(n, "duration");
  const durations = durationEnum
    ?.map(durationSeconds)
    .filter((v): v is number => v !== undefined);
  return {
    durations: durations && durations.length > 0 ? durations : undefined,
    resolutions: enumValuesFor(n, "resolution"),
    aspectRatios: enumValuesFor(n, "aspect_ratio")
  };
}

// FAL image endpoints usually declare an `image_size` enum instead of an
// `aspect_ratio`. This maps its named / explicit sizes onto the aspect-ratio
// vocabulary the picker uses; `auto*` sizes have no fixed ratio and are dropped.
const SIZE_ENUM_TO_ASPECT: Record<string, string> = {
  square: "1:1",
  square_hd: "1:1",
  square_uhd: "1:1",
  "1024x1024": "1:1",
  landscape_4_3: "4:3",
  portrait_4_3: "3:4",
  landscape_16_9: "16:9",
  landscape_hd: "16:9",
  portrait_16_9: "9:16",
  portrait_hd: "9:16",
  landscape_3_2: "3:2",
  "1536x1024": "3:2",
  portrait_3_2: "2:3",
  "1024x1536": "2:3"
};

/** Map a FAL `image_size` enum value onto an aspect ratio, or undefined. */
export function sizeEnumToAspect(value: string): string | undefined {
  return SIZE_ENUM_TO_ASPECT[value];
}

/** Option constraints (aspect/resolution) for an image endpoint. */
export function imageConstraints(n: ManifestNode) {
  // FAL splits size across `aspect_ratio` and `image_size`; union both into one
  // aspect-ratio list, preserving first-seen order and dropping duplicates.
  const fromAspect = enumValuesFor(n, "aspect_ratio") ?? [];
  const fromSize = (enumValuesFor(n, "image_size") ?? [])
    .map(sizeEnumToAspect)
    .filter((v): v is string => Boolean(v));
  const aspectRatios = [...new Set([...fromAspect, ...fromSize])];
  return {
    aspectRatios: aspectRatios.length > 0 ? aspectRatios : undefined,
    // Resolution is its own enum — never derived from image_size.
    resolutions: enumValuesFor(n, "resolution")
  };
}

export function nodeId(n: ManifestNode): string {
  return n.modelId ?? n.endpointId ?? "";
}

export function nodeName(n: ManifestNode): string {
  // className often looks like "FluxSchnellRedux" — split on caps
  const raw = n.title ?? n.className ?? nodeId(n);
  // If it's PascalCase with no spaces, add spaces before capitals
  // Stryker disable next-line Regex: the test is an optimization gate; the replaces below are a no-op without a [a-z][A-Z] boundary, so widening it is behaviour-preserving.
  if (raw && !raw.includes(" ") && /[a-z][A-Z]/.test(raw)) {
    const spaced = raw.replace(/([a-z])([A-Z])/g, "$1 $2");
    // Stryker disable next-line Regex: collapsing the acronym group [A-Z]+ -> [A-Z] leaves the unmatched leading uppercase chars in place, producing identical output.
    return spaced.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  }
  return raw;
}

/** Match a list of keyword fragments against id + name (both lowercased). */
export function matchesAny(haystack: string, ...needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

/**
 * Endpoints that take an existing clip and hand back another one. Their ids
 * never spell out "video-to-video", so without this list they fall through to
 * the generator branch and turn up in the text/image-to-video pickers with no
 * video to work on.
 */
const VIDEO_SOURCE_KEYWORDS = [
  "extend-video",
  "extend video",
  "reframe",
  "retake",
  "edit-video",
  "video-edit",
  "video edit",
  "restyle",
  "outpaint",
  "inpaint",
  "background-removal",
  "background removal",
  "interpolation",
  "dubbing",
  "eraser"
];

/** A bare `/extend` path segment (`.../ltx-video-13b-dev/extend`). */
const EXTEND_SEGMENT = /(^|[/\- ])extend([/\- ]|$)/;

/**
 * Endpoints that need a still (or several) to start from, named in ways the
 * plain "image-to-video" test misses. They are image-conditioned only: a text
 * prompt alone is not a call these accept.
 */
const IMAGE_CONDITIONED_KEYWORDS = [
  "first-last-frame-to-video",
  "first last frame to video",
  "start-end-to-video",
  "keyframes-to-video",
  "frames-to-video",
  "reference-to-video"
];

export function inferVideoTasks(name: string, id: string): string[] {
  const hay = `${id} ${name}`.toLowerCase();
  const tasks: string[] = [];
  // Specialized video transforms — kept out of the text/image generation lists.
  if (matchesAny(hay, "lipsync", "lip-sync", "lip sync")) {
    return ["lip_sync"];
  }
  // Audio-conditioned generators (LTX's audio-to-video, talking-avatar
  // endpoints) need a recording, so neither generation picker can call one.
  // `image-audio-to-video` matches here too, and belongs here: without the
  // audio the call fails whatever image it gets.
  if (matchesAny(hay, "audio-to-video", "audio to video", "speech-to-video")) {
    return ["audio_to_video"];
  }
  if (
    matchesAny(hay, "video-to-video", "video to video", "videotovideo", "v2v")
  ) {
    return ["video_to_video"];
  }
  // Video upscalers/enhancers (Topaz, SeedVR, FlashVSR, …) transform a source
  // clip, but their ids never spell out "video-to-video", so without this they
  // fall through to the generator branch and show up in the text/image-to-video
  // pickers with no video input.
  if (
    matchesAny(
      hay,
      "upscal",
      "super-resolution",
      "super resolution",
      "superres",
      "seedvr",
      "vsr",
      "enhancer"
    )
  ) {
    return ["video_to_video"];
  }
  if (
    matchesAny(hay, ...VIDEO_SOURCE_KEYWORDS) ||
    EXTEND_SEGMENT.test(id.toLowerCase())
  ) {
    return ["video_to_video"];
  }
  if (matchesAny(hay, ...IMAGE_CONDITIONED_KEYWORDS)) {
    return ["image_to_video"];
  }
  if (matchesAny(hay, "text-to-video", "text to video", "texttovideo")) {
    tasks.push("text_to_video");
  }
  if (matchesAny(hay, "image-to-video", "image to video", "imagetovideo")) {
    tasks.push("image_to_video");
  }
  // Ambiguous generator — tag both so generation filtering stays strict.
  return tasks.length > 0 ? tasks : ["text_to_video", "image_to_video"];
}

/**
 * Infer the task(s) an image model serves from its id/name.
 *
 * Specialized transforms (upscale, background removal, relighting,
 * vectorization) are distinctive and mutually exclusive, so they get a single
 * specific task and stay out of the generation pickers. Everything else is a
 * general generator: t2i vs i2i can't be told apart from FAL/Replicate naming
 * (e.g. `virtual-tryon`, `multiple-angles`, `canny` are image-conditioned but
 * don't say so), so generators are tagged with BOTH generation tasks. Tagging
 * every entry means generation filtering is strict for these providers — no
 * reliance on the untagged-passes-everything fallback.
 */
export function inferImageTasks(name: string, id: string): string[] {
  const hay = `${id} ${name}`.toLowerCase();
  if (
    matchesAny(
      hay,
      "upscal",
      "super-resolution",
      "super resolution",
      "superres",
      "esrgan",
      "seedvr",
      "clarity"
    )
  ) {
    return ["upscale"];
  }
  if (
    matchesAny(
      hay,
      "background/remove",
      "remove-background",
      "remove background",
      "removebackground",
      "rembg",
      "bg-remove",
      "/remove-bg",
      "background-removal",
      "bria/background"
    )
  ) {
    return ["remove_background"];
  }
  // IC-Light (fal-ai/iclight-v2, zsxkib/ic-light-background, …) is a relighting
  // model but never spells out "relight" in its id/name, so match it explicitly.
  if (
    matchesAny(
      hay,
      "relight",
      "relighting",
      "re-light",
      "iclight",
      "ic-light",
      "ic_light"
    )
  ) {
    return ["relight"];
  }
  if (
    matchesAny(
      hay,
      "vectorize",
      "vectorization",
      "/vectorize",
      "to-svg",
      "image-to-svg"
    )
  ) {
    return ["vectorize"];
  }
  return ["text_to_image", "image_to_image"];
}

// ---------------------------------------------------------------------------
// Manifest cache
// ---------------------------------------------------------------------------

const _cache = new Map<string, ManifestNode[]>();

export function loadManifest(
  packageName: string,
  exportPath: string
): ManifestNode[] {
  const key = `${packageName}/${exportPath}`;
  // Stryker disable next-line ConditionalExpression: this cache short-circuit is a pure memoization; skipping it just re-resolves the same manifest — behaviour-preserving.
  if (_cache.has(key)) return _cache.get(key)!;

  try {
    const data = loadPackageAssetJson<ManifestNode[]>(
      { pkg: packageName, path: exportPath },
      import.meta.url
    );
    _cache.set(key, data);
    return data;
  } catch (err) {
    // Stryker disable next-line StringLiteral: diagnostic log, not asserted.
    log.warn(`Could not load ${key}: ${err}`);
    _cache.set(key, []);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function loadVideoModels(
  packageName: string,
  exportPath: string,
  provider: string
): VideoModel[] {
  return buildVideoModels(loadManifest(packageName, exportPath), provider);
}

/**
 * Does this entry refuse the call without an input of `kind`?
 *
 * The declaration, not the name: a manifest field marked `required` is the
 * endpoint's own statement that it cannot run without that media. Read across
 * both manifest conventions — FAL/Replicate `inputFields` (`propType`) and
 * AtlasCloud/Kie `fields` (`type`). Kie's `uploads` descriptors carry no
 * requiredness, so they answer false and the name-based inference stands.
 */
export function requiresMediaInput(
  n: ManifestNode,
  kind: "image" | "video"
): boolean {
  const required = (t: string, fRequired?: boolean): boolean =>
    fRequired === true && (t === kind || t === `list[${kind}]`);
  // Stryker disable next-line ArrayDeclaration: an entry with no inputFields declares nothing required either way.
  if (n.inputFields?.some((f) => required(f.propType.toLowerCase(), f.required))) {
    return true;
  }
  // Stryker disable next-line ArrayDeclaration: same rationale for the fields convention.
  return n.fields?.some((f) => required(f.type.toLowerCase(), f.required)) ?? false;
}

/**
 * Drop the generation tasks an entry's own declared inputs rule out, and fall
 * back to the transform task when that leaves nothing.
 *
 * Inference reads names, and a name is often silent about direction — which is
 * why an ambiguous generator is tagged with both. A *required* image input is
 * not silent: `alibaba/qwen-image-3/edit` cannot generate from a prompt alone,
 * and it was the top-ranked `text_to_image` answer a live session got, because
 * nothing here read the field that says so.
 *
 * Only ever subtracts. Explicit `supportedTasks` never reach this.
 */
export function narrowTasksByRequiredInputs(
  tasks: string[],
  n: ManifestNode,
  kind: "image" | "video"
): string[] {
  const generationTask = kind === "image" ? "text_to_image" : "text_to_video";
  const transformTask = kind === "image" ? "image_to_image" : "video_to_video";
  const drop = new Set<string>();
  if (requiresMediaInput(n, "image")) drop.add(generationTask);
  if (kind === "video" && requiresMediaInput(n, "video")) {
    drop.add("text_to_video");
    drop.add("image_to_video");
  }
  if (drop.size === 0) return tasks;
  const kept = tasks.filter((t) => !drop.has(t));
  return kept.length > 0 ? kept : [transformTask];
}

/** Pure transform: manifest nodes → deduplicated, task-tagged video models. */
export function buildVideoModels(
  manifest: ManifestNode[],
  provider: string
): VideoModel[] {
  const seen = new Map<string, VideoModel>();

  for (const n of manifest) {
    if (n.outputType !== "video") continue;
    const id = nodeId(n);
    if (!id) continue;
    const name = nodeName(n);
    const tasks =
      explicitTasks(n) ??
      narrowTasksByRequiredInputs(inferVideoTasks(name, id), n, "video");

    const existing = seen.get(id);
    if (existing) {
      // Stryker disable next-line ArrayDeclaration: existing entries always carry a non-empty supportedTasks (set when first created), so the `?? []` fallback is dead.
      const merged = new Set([...(existing.supportedTasks ?? []), ...tasks]);
      existing.supportedTasks = [...merged];
      // Prefer the first entry that actually declares constraints (image- and
      // text-to-video variants of one model can share an id).
      const c = videoConstraints(n);
      existing.durations ??= c.durations;
      existing.resolutions ??= c.resolutions;
      existing.aspectRatios ??= c.aspectRatios;
    } else {
      seen.set(id, {
        id,
        name,
        provider,
        supportedTasks: tasks,
        ...videoConstraints(n)
      });
    }
  }

  return [...seen.values()];
}

/** A model's declared image input, normalized across manifest conventions. */
export interface ModelImageInput {
  /** API parameter name to set on the request body. */
  apiName: string;
  /** True when the field accepts an array of image URLs. */
  isList: boolean;
  /** Declared field/input name, used for primary-vs-auxiliary heuristics. */
  name: string;
}

/**
 * Image inputs a model declares, resolved from its manifest entry. KIE-style
 * `uploads` (which carry the real API param name) take precedence; otherwise
 * the FAL/Replicate `inputFields` image/list[image] entries are used.
 */
/**
 * Input parameter names a model declares, from the generated manifest.
 *
 * Providers assemble a generic input bag from `*Params` (prompt,
 * negative_prompt, strength, seed…), but each endpoint accepts only a subset.
 * Replicate rejects the whole prediction with a validation error when it sees
 * an undeclared field rather than ignoring it, so sending the superset fails
 * outright — `decart/lucy-edit-2` takes neither `negative_prompt` nor
 * `strength`.
 *
 * Returns an empty set when the model is missing from the manifest or declares
 * no fields. Callers must read that as "unknown, send everything" rather than
 * "accepts nothing", so a model absent from the manifest keeps working.
 */
export function getModelInputNames(
  packageName: string,
  exportPath: string,
  modelId: string
): Set<string> {
  const entry = loadManifest(packageName, exportPath).find(
    (n) => nodeId(n) === modelId
  );
  return new Set(
    (entry?.inputFields ?? [])
      .map((f) => f.name)
      .filter((n): n is string => typeof n === "string" && n.length > 0)
  );
}

export function getModelImageInputs(
  packageName: string,
  exportPath: string,
  modelId: string
): ModelImageInput[] {
  const entry = loadManifest(packageName, exportPath).find(
    (n) => nodeId(n) === modelId
  );
  if (!entry) return [];
  return manifestEntryImageInputs(entry);
}

/**
 * Pure: resolve the image inputs declared by a single manifest entry. KIE-style
 * `uploads` (which carry the real API param name) take precedence; otherwise the
 * FAL/Replicate `inputFields` image / list[image] entries are used.
 */
export function manifestEntryImageInputs(
  entry: ManifestNode
): ModelImageInput[] {
  if (entry.uploads?.length) {
    return entry.uploads
      .filter((u) => u.kind === "image")
      .map((u) => ({
        apiName: u.paramName ?? `${u.field}_url${u.isList ? "s" : ""}`,
        isList: Boolean(u.isList),
        name: u.field
      }));
  }
  return (entry.inputFields ?? [])
    .filter((f) => {
      const t = f.propType.toLowerCase();
      return t === "image" || t === "list[image]";
    })
    .map((f) => ({
      apiName: f.apiParamName ?? f.name,
      isList: f.propType.toLowerCase().startsWith("list["),
      name: f.name
    }));
}

/** A model's declared input field, normalized across manifest conventions. */
export interface ModelInputField {
  /** API parameter name to set on the request body. */
  name: string;
  /** Declared type: "str" | "enum" | "int" | "float" | "bool" | ... (lowercased). */
  type: string;
  enumValues?: string[];
  required?: boolean;
  default?: unknown;
  /**
   * Declared upper bound: character count for a string field, numeric ceiling
   * otherwise. Kie publishes it (Kling 2.6's `prompt` is capped at 1000) and
   * rejects an over-long value with an unnamed 500, so carrying it here lets a
   * provider enforce the cap before spending the round trip.
   */
  max?: number;
  /**
   * The request array this field's value belongs in, as `{ url, type }`
   * objects, rather than under `name`. AtlasCloud's reference-to-video models
   * take one mixed `refers` array; the manifest splits it into typed inputs.
   */
  wrapInto?: string;
}

/**
 * The input fields a model declares, normalized across manifest conventions.
 * Kie `fields` (where `name` is the API param and options live in `values`) take
 * precedence; otherwise the FAL/Replicate `inputFields` are normalized
 * (`apiParamName ?? name`, `propType` lowercased, `enumValues`).
 */
export function getModelInputFields(
  packageName: string,
  exportPath: string,
  modelId: string
): ModelInputField[] {
  const entry = loadManifest(packageName, exportPath).find(
    (n) => nodeId(n) === modelId
  );
  if (!entry) return [];
  if (entry.fields?.length) {
    return entry.fields.map((f) => {
      const field: ModelInputField = {
        name: f.name,
        type: f.type.toLowerCase()
      };
      if (f.values && f.values.length > 0) {
        field.enumValues = f.values;
      }
      if (f.required !== undefined) {
        field.required = f.required;
      }
      if (f.default !== undefined) {
        field.default = f.default;
      }
      if (isNumber(f.max)) {
        field.max = f.max;
      }
      if (f.wrapInto !== undefined) {
        field.wrapInto = f.wrapInto;
      }
      return field;
    });
  }
  return (entry.inputFields ?? []).map((f) => {
    const field: ModelInputField = {
      name: f.apiParamName ?? f.name,
      type: f.propType.toLowerCase()
    };
    if (f.enumValues && f.enumValues.length > 0) {
      field.enumValues = f.enumValues;
    }
    return field;
  });
}

function requiredTextInputsOf(entry: ManifestNode): string[] {
  const names = new Set<string>();
  const textFields = new Set<string>();
  // Kie: `fields`, where `name` is the API param.
  for (const field of entry.fields ?? []) {
    if (field.type.toLowerCase() !== "str") continue;
    textFields.add(field.name);
    if (field.required === true) names.add(field.name);
  }
  // Kie also states it a second way, as the rules the node factory enforces
  // before spending a call. Most entries say both; some say only this one.
  for (const rule of entry.validation ?? []) {
    if (rule.rule === "not_empty" && textFields.has(rule.field)) {
      names.add(rule.field);
    }
  }
  // FAL / Replicate: `inputFields`. The declared `name` is the property name;
  // `apiParamName` is the wire name, which is not what a node property is called.
  for (const field of entry.inputFields ?? []) {
    if (field.required === true && field.propType.toLowerCase() === "str") {
      names.add(field.name);
    }
  }
  return [...names];
}

/**
 * Text fields `modelId` refuses to run without, by the name the manifest gives
 * them — which is also the name the generic media nodes give the matching
 * property, so a caller can match one against the other.
 *
 * Restricted to text on purpose. A required *media* field is fed through the
 * node's own image/video wiring under a different API name (kie's `images`
 * arrives as `image_urls`), and a required number or enum carries a default the
 * provider fills in. What is left is the case that actually fails: a text field
 * the endpoint rejects when blank. `kling-2.6/image-to-video` declares `prompt`
 * required in both conventions and answers an empty one with
 * `500 This field is required`, naming neither the field nor the model.
 *
 * Undefined means the model is not in this manifest — "cannot tell", never
 * "requires nothing". An entry that declares none returns an empty list.
 */
export function getRequiredTextInputNames(
  packageName: string,
  exportPath: string,
  modelId: string
): string[] | undefined {
  const entry = loadManifest(packageName, exportPath).find(
    (n) => nodeId(n) === modelId
  );
  if (!entry) return undefined;
  return requiredTextInputsOf(entry);
}

/** Kie execution metadata carried on a manifest entry. */
interface ManifestNodeMeta {
  useSuno: boolean;
  sunoEndpoint?: string;
  pollInterval?: number;
  maxAttempts?: number;
}

/**
 * Kie execution metadata for a model, or undefined when the model id is unknown.
 */
export function getManifestNodeMeta(
  packageName: string,
  exportPath: string,
  modelId: string
): ManifestNodeMeta | undefined {
  const entry = loadManifest(packageName, exportPath).find(
    (n) => nodeId(n) === modelId
  );
  if (!entry) return undefined;
  const meta: ManifestNodeMeta = { useSuno: Boolean(entry.useSuno) };
  if (entry.sunoEndpoint !== undefined) {
    meta.sunoEndpoint = entry.sunoEndpoint;
  }
  if (entry.pollInterval !== undefined) {
    meta.pollInterval = entry.pollInterval;
  }
  if (entry.maxAttempts !== undefined) {
    meta.maxAttempts = entry.maxAttempts;
  }
  return meta;
}

// Auxiliary image inputs (mask / control / reference / style / end-frame, …)
// must never receive the primary source image in a generic request.
const AUXILIARY_IMAGE_RE =
  // Stryker disable next-line Regex: heuristic alternation; auxiliary-vs-primary behaviour is pinned by tests, but the optional `[_-]?` separator variants are functionally interchangeable for real field names.
  /mask|control|reference|style|depth|canny|pose|ip[_-]?adapter|redux|face|last_frame|end_image|end_frame/i;

// Primary source-image field names, best first. Covers i2i (`image`,
// `input_image`, `image_input`) and i2v first-frame (`first_frame_image`,
// `start_image`).
const PRIMARY_IMAGE_PRIORITY = [
  "image",
  "input_image",
  "image_input",
  "images",
  "input_images",
  "img",
  "first_frame_image",
  "start_image",
  "source_image",
  "image_path",
  "subject_image",
  "file"
];

/**
 * Choose the mask image input declared by a model's manifest entry. Returns the
 * first field whose name or API param name contains "mask", or undefined when
 * the model doesn't declare one (callers fall back to a conventional name like
 * `mask_url`).
 */
export function selectMaskImageInput(
  inputs: ModelImageInput[]
): ModelImageInput | undefined {
  return inputs.find((i) => /mask/i.test(i.name) || /mask/i.test(i.apiName));
}

/**
 * Choose the primary image input for a generic image-to-image / image-to-video
 * request. Auxiliary inputs (mask, control, reference/style/end-frame images)
 * are skipped. When more than one source image is supplied, a list-typed field
 * is strongly preferred so every image is forwarded.
 */
export function selectPrimaryImageInput(
  inputs: ModelImageInput[],
  imageCount: number
): ModelImageInput | undefined {
  const primary = inputs.filter((i) => !AUXILIARY_IMAGE_RE.test(i.name));
  const pool = primary.length > 0 ? primary : inputs;
  // Stryker disable next-line ConditionalExpression: equivalent — pool is empty only when inputs is empty, and the sort+[0] below also yields undefined for an empty pool.
  if (pool.length === 0) return undefined;
  const multiple = imageCount > 1;
  const score = (i: ModelImageInput): number => {
    let idx = PRIMARY_IMAGE_PRIORITY.indexOf(i.name.toLowerCase());
    if (idx < 0) idx = PRIMARY_IMAGE_PRIORITY.length;
    if (multiple) idx += i.isList ? -100 : 10;
    return idx;
  };
  return [...pool].sort((a, b) => score(a) - score(b))[0];
}

export function loadImageModels(
  packageName: string,
  exportPath: string,
  provider: string
): ImageModel[] {
  return buildImageModels(loadManifest(packageName, exportPath), provider);
}

/** Pure transform: manifest nodes → deduplicated, task-tagged image models. */
export function buildImageModels(
  manifest: ManifestNode[],
  provider: string
): ImageModel[] {
  const seen = new Map<string, ImageModel>();

  for (const n of manifest) {
    const id = nodeId(n);
    if (!id || seen.has(id)) continue;
    const name = nodeName(n);
    // Copy so the mask-input augmentation below never mutates the manifest
    // node's own `supportedTasks` array (which `loadManifest` memoizes and
    // shares across every caller).
    const tasks = [
      ...(explicitTasks(n) ??
        narrowTasksByRequiredInputs(inferImageTasks(name, id), n, "image"))
    ];
    // Endpoints that declare a mask image input support inpainting (mask-guided
    // editing). Tag them so the inpaint capability/picker can find them.
    if (
      !tasks.includes("inpainting") &&
      selectMaskImageInput(manifestEntryImageInputs(n))
    ) {
      tasks.push("inpainting");
    }
    // Image-typed entries always qualify. `dict`-typed entries (FAL endpoints
    // whose response schema is an object, e.g. clarity-upscaler) are salvaged
    // only when they're recognizable image transforms, so the picker can offer
    // them under upscale/remove-background/relight/vectorize.
    const qualifies =
      n.outputType === "image" ||
      // Stryker disable next-line ConditionalExpression,EqualityOperator: tasks is always non-empty (infer* returns >=1, explicit is non-empty), so `tasks.length > 0` is invariantly true here.
      (n.outputType === "dict" && tasks.length > 0);
    if (!qualifies) continue;
    seen.set(id, {
      id,
      name,
      provider,
      supportedTasks: tasks,
      ...imageConstraints(n)
    });
  }

  return [...seen.values()];
}

/**
 * Everything an audio entry says about itself: id, name, and the capability
 * tags. FAL files every text→audio endpoint — speech, music, and sound
 * effects alike — under `moduleName: "text_to_audio"`, so the module name
 * cannot tell the three apart; the tags can.
 */
function audioHaystack(n: ManifestNode): string {
  return `${nodeId(n)} ${nodeName(n)} ${(n.tags ?? []).join(" ")}`.toLowerCase();
}

/** Speech that self-declares in its id or name, rather than in a tag. */
function saysTextToSpeech(n: ManifestNode): boolean {
  const hay = `${nodeId(n)} ${nodeName(n)}`.toLowerCase();
  return matchesAny(
    hay,
    "text-to-speech",
    "text to speech",
    "texttospeech",
    "tts"
  );
}

// Endpoints that take existing audio and hand back more of it. They are not
// generators: offered as a text_to_music or text_to_speech model they fail at
// call time with nothing to work on.
const AUDIO_TRANSFORM_KEYWORDS = [
  "audio-to-audio",
  "audio_to_audio",
  "speech-to-speech",
  "video-to-audio",
  "inpaint",
  "outpaint",
  "isolation",
  "voice-changer",
  "extend-audio",
  "audio-extend",
  "super-resolution",
  "loudnorm",
  "compressor",
  "impulse-response"
];

// Sound-effect generators. They emit audio from a prompt like a music model
// does, and are neither music nor speech.
const SOUND_EFFECT_KEYWORDS = [
  "sound-effect",
  "sound_effect",
  "sound effects",
  "soundeffect",
  "sfx",
  "foley"
];

// Speech engines whose names carry no "tts"/"speech" substring. Without them
// FAL's Kokoro language variants — tagged only `[audio, generation,
// text-to-audio, sound]` — are in no list at all.
const TTS_KEYWORDS = [
  "speech",
  "voiceover",
  "narration",
  "dialogue",
  "kokoro",
  "zonos",
  "chatterbox"
];

/** Takes existing audio rather than generating it from a prompt. */
export function isAudioTransformNode(n: ManifestNode): boolean {
  return matchesAny(audioHaystack(n), ...AUDIO_TRANSFORM_KEYWORDS);
}

/** Generates sound effects — neither music nor speech. */
export function isSoundEffectNode(n: ManifestNode): boolean {
  return matchesAny(audioHaystack(n), ...SOUND_EFFECT_KEYWORDS);
}

/**
 * Is this manifest entry a text-to-speech model? An explicit task or FAL's
 * `moduleName: "text_to_speech"` settles it, as does a "text-to-speech"/"tts"
 * hint in the id or name — those are the endpoint naming itself, and outrank
 * the exclusions below, so a voice-clone TTS endpoint that also takes
 * reference audio stays a TTS model. Everything else is decided on the tags:
 * a music model, an audio transform and a sound-effect generator are none of
 * them speech, and what is left qualifies on a speech keyword.
 */
export function isTTSNode(n: ManifestNode): boolean {
  if (n.outputType !== "audio") return false;
  if (explicitTasks(n)?.includes("text_to_speech")) return true;
  if (n.moduleName === "text_to_speech") return true;
  if (saysTextToSpeech(n)) return true;
  if (isMusicNode(n) || isAudioTransformNode(n) || isSoundEffectNode(n)) {
    return false;
  }
  return matchesAny(audioHaystack(n), ...TTS_KEYWORDS);
}

export function loadTTSModels(
  packageName: string,
  exportPath: string,
  provider: string
): TTSModel[] {
  return buildTTSModels(loadManifest(packageName, exportPath), provider);
}

/** Pure transform: manifest nodes → deduplicated TTS models with voice lists. */
export function buildTTSModels(
  manifest: ManifestNode[],
  provider: string
): TTSModel[] {
  const seen = new Map<string, TTSModel>();

  for (const n of manifest) {
    if (!isTTSNode(n)) continue;
    const id = nodeId(n);
    if (!id || seen.has(id)) continue;
    // Preset voices come from an enumerated `voice` (or `speaker`) field.
    // Models that take a free-form voice id / reference audio have none.
    const voices = enumValuesFor(n, "voice") ?? enumValuesFor(n, "speaker");
    const model: TTSModel = {
      id,
      name: nodeName(n),
      provider: provider
    };
    if (voices) {
      model.voices = voices;
    }
    seen.set(id, model);
  }

  return [...seen.values()];
}

// Music-generation engine names and signal words. Used to tell music endpoints
// apart from speech / sound-effect audio nodes (the `outputType === "audio"`
// guard plus the `!isTTSNode` check already exclude TTS).
const MUSIC_KEYWORDS = [
  "music",
  "song",
  "lyric",
  "vocal",
  "instrumental",
  "soundtrack",
  "melody",
  "remix",
  "cover",
  "musicgen",
  "audiogen",
  "stable-audio",
  "stable_audio",
  "suno",
  "ace-step",
  "acestep",
  "diffrhythm",
  "lyria",
  "sonauto",
  "cassette",
  "beatoven",
  "jukebox",
  "flux-music",
  "yue"
];

// Kie Suno ships many audio endpoints, but only a few generate music from a
// text prompt — the rest transform existing audio or tasks (referenced by
// upload / task / audio / music ids) or output text (lyrics). A required field
// whose name references such an existing asset marks a transform, not a
// generator.
const AUDIO_ASSET_REF_RE =
  // Stryker disable next-line Regex: heuristic alternation over Suno field names; the exact-boundary variants are interchangeable for the real manifest names, and the predicate is pinned by a test against the real manifest.
  /upload|task_?id|audio_?id|music_?id|verify|voice_?url/i;

/**
 * Is this Kie-style entry a text-to-music generator? True only when it declares
 * a free-form `prompt`, selects a generation `model`, and requires no field
 * that references an existing audio asset or task. On the current Kie manifest
 * this yields exactly {generate-music, generate-sounds}; every Suno utility
 * (covers, extends, mashups, vocal splits, lyric/voice tools) is rejected.
 */
export function isKieMusicNode(n: ManifestNode): boolean {
  const fields = n.fields ?? [];
  const hasPrompt = fields.some((f) => f.name === "prompt");
  const hasModel = fields.some((f) => f.name === "model");
  const requiresAsset = fields.some(
    (f) => f.required === true && AUDIO_ASSET_REF_RE.test(f.name)
  );
  return hasPrompt && hasModel && !requiresAsset;
}

/**
 * Is this manifest entry a music-generation model? Music endpoints emit audio
 * from a prompt but are neither speech nor sound effects. Kie-style entries
 * (those that carry a `fields` schema or route through Suno) are judged
 * structurally by `isKieMusicNode` — keyword matching over-tags Suno's utility
 * endpoints. Everything else needs positive music evidence: an explicit
 * `text_to_music` task, or a music keyword in the id, name or tags.
 *
 * FAL's `moduleName: "text_to_audio"` used to be taken as that evidence, and
 * it is not one: FAL files every text→audio endpoint under it, so the music
 * catalog carried the Kokoro voices, `elevenlabs/text-to-dialogue` and every
 * sound-effect generator — and a session asking for a music model was handed a
 * dialogue model that a `music_model` property then refused.
 */
export function isMusicNode(n: ManifestNode): boolean {
  if (n.outputType !== "audio") return false;
  if (Array.isArray(n.fields) || n.useSuno === true) {
    return isKieMusicNode(n);
  }
  if (explicitTasks(n)?.includes("text_to_music")) return true;
  if (isAudioTransformNode(n) || isSoundEffectNode(n)) return false;
  return matchesAny(audioHaystack(n), ...MUSIC_KEYWORDS);
}

export function loadMusicModels(
  packageName: string,
  exportPath: string,
  provider: string
): MusicModel[] {
  return buildMusicModels(loadManifest(packageName, exportPath), provider);
}

/** Pure transform: manifest nodes → deduplicated text-to-music models. */
export function buildMusicModels(
  manifest: ManifestNode[],
  provider: string
): MusicModel[] {
  const seen = new Map<string, MusicModel>();

  for (const n of manifest) {
    if (!isMusicNode(n)) continue;
    const id = nodeId(n);
    if (!id || seen.has(id)) continue;
    seen.set(id, {
      id,
      name: nodeName(n),
      provider: provider,
      supportedTasks: ["text_to_music"]
    });
  }

  return [...seen.values()];
}
