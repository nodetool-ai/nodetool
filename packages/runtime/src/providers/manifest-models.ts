/**
 * Load image / video model lists from node-package manifests.
 *
 * Each provider's node package ships a manifest JSON describing every node
 * (endpoint, class name, output type, etc.).  This module extracts and
 * deduplicates the image and video entries so providers don't need to
 * maintain hardcoded model lists.
 */

import { createLogger, importNodeBuiltin } from "@nodetool-ai/config";
import type {
  ImageModel,
  MusicModel,
  TTSModel,
  VideoModel
} from "./types.js";

// Stryker disable next-line StringLiteral: logger name is diagnostic, not asserted.
const log = createLogger("nodetool.runtime.providers.manifest-models");

const _nodeModule = await importNodeBuiltin<typeof import("node:module")>(
  "node:module"
);

// ---------------------------------------------------------------------------
// Manifest entry shapes — union of Kie / FAL / Replicate conventions
// ---------------------------------------------------------------------------

interface ManifestInputField {
  name: string;
  apiParamName?: string;
  propType: string;
  enumValues?: string[];
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
  /** Explicit task set declared by manifests that know model capabilities. */
  supportedTasks?: string[];
  /** FAL ships per-endpoint input schemas; used to derive option constraints. */
  inputFields?: ManifestInputField[];
  /** Kie ships asset upload descriptors (field → API param mapping). */
  uploads?: ManifestUpload[];
}

export function explicitTasks(n: ManifestNode): string[] | undefined {
  return Array.isArray(n.supportedTasks) && n.supportedTasks.length > 0
    ? n.supportedTasks
    : undefined;
}

/** Enum values declared for a manifest input field, by canonical API name. */
export function enumValuesFor(
  n: ManifestNode,
  apiName: string
): string[] | undefined {
  // Stryker disable next-line ArrayDeclaration: the fallback's contents are irrelevant — a non-array node yields no matching field either way.
  const field = (n.inputFields ?? []).find(
    (f) => (f.apiParamName ?? f.name) === apiName
  );
  const values = field?.enumValues;
  return values && values.length > 0 ? values : undefined;
}

/** Option constraints (duration/resolution/aspect) for a video endpoint. */
export function videoConstraints(n: ManifestNode): {
  durations?: number[];
  resolutions?: string[];
  aspectRatios?: string[];
} {
  const durationEnum = enumValuesFor(n, "duration");
  const durations = durationEnum
    ?.map((v) => Number(v))
    .filter((v) => Number.isFinite(v));
  return {
    durations: durations && durations.length > 0 ? durations : undefined,
    resolutions: enumValuesFor(n, "resolution"),
    aspectRatios: enumValuesFor(n, "aspect_ratio")
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

export function inferVideoTasks(name: string, id: string): string[] {
  const hay = `${id} ${name}`.toLowerCase();
  const tasks: string[] = [];
  // Specialized video transforms — kept out of the text/image generation lists.
  if (matchesAny(hay, "lipsync", "lip-sync", "lip sync")) {
    return ["lip_sync"];
  }
  if (matchesAny(hay, "video-to-video", "video to video", "videotovideo", "v2v")) {
    return ["video_to_video"];
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
  if (matchesAny(hay, "upscal", "super-resolution", "super resolution", "superres", "esrgan", "seedvr", "clarity")) {
    return ["upscale"];
  }
  if (matchesAny(hay, "background/remove", "remove-background", "remove background", "removebackground", "rembg", "bg-remove", "/remove-bg", "background-removal", "bria/background")) {
    return ["remove_background"];
  }
  // IC-Light (fal-ai/iclight-v2, zsxkib/ic-light-background, …) is a relighting
  // model but never spells out "relight" in its id/name, so match it explicitly.
  if (matchesAny(hay, "relight", "relighting", "re-light", "iclight", "ic-light", "ic_light")) {
    return ["relight"];
  }
  if (matchesAny(hay, "vectorize", "vectorization", "/vectorize", "to-svg", "image-to-svg")) {
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

  // _nodeModule is absent only in a non-Node runtime (browser/edge), which the
  // test environment never is — this fallback is unreachable here.
  // Stryker disable all
  if (!_nodeModule) {
    _cache.set(key, []);
    return [];
  }
  // Stryker restore all
  try {
    const req = _nodeModule.createRequire(import.meta.url);
    const data = req(`${packageName}/${exportPath}`) as ManifestNode[];
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
    const tasks = explicitTasks(n) ?? inferVideoTasks(name, id);

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
  return inputs.find(
    (i) => /mask/i.test(i.name) || /mask/i.test(i.apiName)
  );
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
    const tasks = explicitTasks(n) ?? inferImageTasks(name, id);
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
    seen.set(id, { id, name, provider, supportedTasks: tasks });
  }

  return [...seen.values()];
}

/**
 * Is this manifest entry a text-to-speech model? FAL tags TTS endpoints with
 * `moduleName: "text_to_speech"`; KIE has no module grouping, so we fall back to
 * an explicit task or a "text-to-speech"/"tts" hint in the id/name. The
 * `outputType === "audio"` guard keeps music / sound-effect audio nodes out.
 */
export function isTTSNode(n: ManifestNode): boolean {
  if (n.outputType !== "audio") return false;
  if (n.moduleName === "text_to_speech") return true;
  if (explicitTasks(n)?.includes("text_to_speech")) return true;
  const hay = `${nodeId(n)} ${nodeName(n)}`.toLowerCase();
  return matchesAny(hay, "text-to-speech", "text to speech", "texttospeech", "tts");
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
    seen.set(id, {
      id,
      name: nodeName(n),
      provider: provider as TTSModel["provider"],
      ...(voices ? { voices } : {})
    });
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
  "flux-music"
];

/**
 * Is this manifest entry a music-generation model? Music endpoints emit audio
 * but are neither speech (TTS) nor speech-to-text. FAL groups them under
 * `moduleName: "text_to_audio"`; other manifests have no grouping, so fall back
 * to an explicit `text_to_music` task or a music keyword in the id/name. The
 * `outputType === "audio"` and `!isTTSNode` guards keep speech models out.
 */
export function isMusicNode(n: ManifestNode): boolean {
  if (n.outputType !== "audio") return false;
  if (isTTSNode(n)) return false;
  if (n.moduleName === "text_to_audio") return true;
  if (explicitTasks(n)?.includes("text_to_music")) return true;
  const hay = `${nodeId(n)} ${nodeName(n)}`.toLowerCase();
  return matchesAny(hay, ...MUSIC_KEYWORDS);
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
      provider: provider as MusicModel["provider"],
      supportedTasks: ["text_to_music"]
    });
  }

  return [...seen.values()];
}
