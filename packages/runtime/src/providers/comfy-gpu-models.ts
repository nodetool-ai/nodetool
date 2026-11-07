/** Model/task catalog for workflows executed on Comfy Cloud's GPUs. */
import { Comfy } from "@comfyorg/sdk";
import { createLogger, loadPackageAssetJson } from "@nodetool-ai/config";
import type { ComfyApiPrompt, ComfyObjectInfo } from "@nodetool-ai/protocol";
import { COMFY_TEMPLATES } from "./comfy-template-graphs.js";
import { COMFY_RESTRICTED_MODELS_ENV } from "./comfy-workflow-models.js";
import { comfyUiToPrompt } from "./comfy-ui-prompt.js";
import { comfyCloudFetch } from "./comfy-fetch.js";
import { fetchWithRetry } from "./http-transport.js";
import { sniffMime } from "./comfy-router.js";

const log = createLogger("nodetool.runtime.providers.comfy-gpu");

/** Media loaders that remain after the graph is pruned to its outputs. */
export interface ComfyGpuMediaInputs {
  readonly image: number;
  readonly video: number;
  readonly audio: number;
}
export interface ComfyGpuTemplate {
  readonly id: string;
  readonly source: string;
  readonly name: string;
  readonly models: readonly string[];
  readonly kind: "image" | "video" | "audio" | "text" | "model3d";
  readonly task: string;
  readonly restricted: boolean;
  readonly outputNodes: readonly string[];
  /** Computed by scripts/comfy-templates/gpu-catalog.mjs. */
  readonly inputs?: ComfyGpuMediaInputs;
  readonly workflow: unknown;
}
interface Catalog {
  readonly revision: string;
  readonly templates: readonly ComfyGpuTemplate[];
  readonly excluded: ReadonlyArray<{ source: string; models: string[]; reason: string }>;
}
let catalog: Catalog | undefined;
export function comfyGpuCatalog(): Catalog {
  catalog ??= loadPackageAssetJson<Catalog>({ pkg: "@nodetool-ai/runtime", path: "providers/comfy-gpu-catalog.json" }, import.meta.url);
  return catalog;
}
export function comfyGpuTemplate(id: string): ComfyGpuTemplate | undefined {
  return comfyGpuCatalog().templates.find((template) => template.id === id);
}
export function listedComfyGpuTemplates(): readonly ComfyGpuTemplate[] {
  const pinned = new Set(COMFY_TEMPLATES.filter((template) => template.task !== "text_to_audio").map((template) => template.source));
  const previous = new Set(["video_wan2_2_5B_ti2v", "video_wan2_2_14B_i2v", "video_ltx2_3_i2v", "video_minimax_h3_i2v"]);
  return comfyGpuCatalog().templates.filter((template) =>
    !pinned.has(template.source) && !previous.has(template.source) &&
    (!template.restricted || process.env[COMFY_RESTRICTED_MODELS_ENV] === "1"));
}
/**
 * True when the provider's callers can supply the template's media.
 * Image-to-video callers send one start image (the end frame is optional), so
 * two-image first/last-frame templates would fail for most of them.
 * Reference-to-video callers send one or more images and usually no audio.
 */
export function comfyGpuTemplateFits(template: Pick<ComfyGpuTemplate, "task" | "inputs">): boolean {
  const inputs = template.inputs;
  if (!inputs) {return true;}
  if (template.task === "image_to_video") {return inputs.image === 1 && inputs.video === 0 && inputs.audio === 0;}
  if (template.task === "reference_to_video") {return inputs.image >= 1 && inputs.video === 0 && inputs.audio === 0;}
  return true;
}

const API_KEY_HINT = "A step inside this Comfy graph calls a hosted model and needs your Comfy API key.";

/** Name the template and job in a failure, keeping the original as `cause`. */
export function comfyJobError(name: string, jobId: string | undefined, error: unknown): unknown {
  if (error instanceof Error && error.name === "AbortError" || error instanceof DOMException) {return error;}
  if (error instanceof Error && error.message.startsWith(`Comfy ${name} `)) {return error;}
  const detail = error instanceof Error ? error.message : String(error);
  const hint = /api[ _-]?key|credential/i.test(detail) ? `. ${API_KEY_HINT}` : "";
  return new Error(`Comfy ${name}${jobId ? ` job ${jobId}` : ""} failed: ${detail}${hint}`, { cause: error });
}

/** Keep surplus reference images in order; refuse every other mismatch before any paid work. */
function fitMedia(template: ComfyGpuTemplate, counts: ComfyGpuMediaInputs, sources: Record<keyof ComfyGpuMediaInputs, readonly Uint8Array[]>) {
  const fitted = { ...sources };
  for (const kind of ["image", "video", "audio"] as const) {
    const required = counts[kind];
    const received = sources[kind].length;
    if (required === received) {continue;}
    if (kind === "image" && template.task === "reference_to_video" && received > required && required > 0) {
      log.warn(`${template.name} takes ${required} image input(s); received ${received}. Using the first ${required}.`);
      fitted.image = sources.image.slice(0, required);
      continue;
    }
    throw new Error(`${template.name} requires ${required} ${kind} input(s), received ${received}`);
  }
  return fitted;
}

export interface ComfyGpuInput {
  readonly prompt?: string | null;
  readonly images?: readonly Uint8Array[];
  readonly videos?: readonly Uint8Array[];
  readonly audios?: readonly Uint8Array[];
  readonly lyrics?: string | null;
  readonly seed?: number | null;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly aspectRatio?: string | null;
  readonly durationSeconds?: number | null;
  readonly numFrames?: number | null;
  readonly numInferenceSteps?: number | null;
  readonly guidanceScale?: number | null;
  readonly maxTokens?: number;
  readonly timeoutSeconds?: number | null;
  readonly signal?: AbortSignal;
}
function link(value: unknown): value is [string, number] {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && Number.isInteger(value[1]);
}

/** Bind the provider contract and retain only dependencies of its saved output. */
export function prepareComfyGpuPrompt(source: ComfyApiPrompt, template: ComfyGpuTemplate, input: ComfyGpuInput): ComfyApiPrompt {
  const graph = structuredClone(source);
  const negative = new Set<string>();
  const markNegative = (id: string): void => {
    if (negative.has(id)) {return;}
    const node = graph[id];
    if (!node || node.class_type === "ConditioningZeroOut") {return;}
    negative.add(id);
    for (const [field, value] of Object.entries(node.inputs)) {if (/^(negative|conditioning(?:_\d+)?)$/.test(field) && link(value)) {markNegative(value[0]);}}
  };
  for (const node of Object.values(graph)) {if (link(node.inputs.negative)) {markNegative(node.inputs.negative[0]);}}
  const seed = input.seed != null && Number.isFinite(input.seed) && input.seed >= 0 ? Math.floor(input.seed) : Math.floor(Math.random() * 2 ** 31);
  const fps = /wan/i.test(template.source) ? 16 : 24;
  const grid = /minimax_h3|fasth3|pika_h3/.test(template.source) ? 17 : /ltx/.test(template.source) ? 8 : 4;
  const offset = grid === 17 ? 5 : 1;
  const requestedFrames = input.numFrames ?? (input.durationSeconds ? input.durationSeconds * fps + offset : undefined);
  const frames = requestedFrames == null ? undefined : Math.max(grid + offset, Math.floor((requestedFrames - offset) / grid) * grid + offset);
  const [rw, rh] = (input.aspectRatio ?? "1:1").split(":").map(Number);
  if (!Number.isFinite(rw) || !Number.isFinite(rh) || rw <= 0 || rh <= 0) {throw new Error("Comfy GPU aspect ratio must contain two positive numbers");}
  const widths = Object.values(graph).map((node) => node.inputs.width).filter((value): value is number => typeof value === "number" && value > 0);
  const heights = Object.values(graph).map((node) => node.inputs.height).filter((value): value is number => typeof value === "number" && value > 0);
  const baseWidth = widths.length ? Math.max(...widths) : 1024;
  const baseHeight = heights.length ? Math.max(...heights) : 1024;
  const width = input.width ?? Math.sqrt(baseWidth * baseHeight * rw / rh);
  const height = input.height ?? Math.sqrt(baseWidth * baseHeight * rh / rw);
  const sizeRequested = input.width != null || input.height != null || input.aspectRatio != null;
  const snap = (value: number): number => Math.max(16, Math.round(value / 16) * 16);
  for (const [id, node] of Object.entries(graph)) {
    const values = node.inputs;
    const enhancer = node.class_type === "TextGenerate" && template.kind !== "text";
    if (!enhancer && input.prompt != null) {
      for (const field of ["prompt", "positive_prompt", "caption", "tags"]) {if (field in values) {values[field] = input.prompt;}}
      if ((/^CLIPTextEncode|^TextEncode/.test(node.class_type) && !negative.has(id)) || template.task === "text_to_speech") {
        if ("text" in values) {values.text = input.prompt;}
      }
      if (/YuE2Generate/.test(node.class_type)) {values.style = input.prompt;}
    }
    if (template.task === "text_to_music" && "lyrics" in values) {values.lyrics = input.lyrics ?? "";}
    for (const field of Object.keys(values)) {
      if (/(^|[._])(?:noise_)?seed$/.test(field)) {values[field] = seed;}
      if (input.durationSeconds != null && ["duration", "seconds", "max_duration"].includes(field)) {values[field] = input.durationSeconds;}
      if (frames != null && ["length", "frames_number", "num_frames"].includes(field)) {values[field] = frames;}
      if (input.numInferenceSteps != null && field === "steps") {values[field] = input.numInferenceSteps;}
      if (input.guidanceScale != null && field === "cfg") {values[field] = input.guidanceScale;}
    }
    if (input.maxTokens != null && node.class_type === "TextGenerate") {values.max_length = input.maxTokens;}
    if (template.kind === "text" && node.class_type === "TextGenerate") {
      for (const field of ["image", "audio", "video"]) {delete values[field];}
    }
    if (sizeRequested && "width" in values && "height" in values) {
      values.width = snap(width * (typeof values.width === "number" ? values.width / baseWidth : 1));
      values.height = snap(height * (typeof values.height === "number" ? values.height / baseHeight : 1));
    }
  }
  const outputClass = template.kind === "image" ? /^(Save.*Image|SaveAnimated)/ : template.kind === "video" ? /^(SaveVideo|VHS_VideoCombine)/ :
    template.kind === "audio" ? /^SaveAudio/ : template.kind === "text" ? /^(PreviewAny|SaveText)/ : /^(Save(?!.*(?:Image|Video|Audio|Text))|Preview3D)/i;
  const roots = Object.keys(graph).filter((id) => outputClass.test(graph[id].class_type));
  if (roots.length === 0) {throw new Error(`Comfy template ${template.name} has no ${template.kind} output`);}
  const retained: ComfyApiPrompt = {};
  const pending = [...roots];
  while (pending.length > 0) {
    const id = pending.pop();
    if (!id || retained[id]) {continue;}
    const node = graph[id];
    if (!node) {throw new Error(`Comfy template has a dangling link to ${id}`);}
    retained[id] = node;
    for (const value of Object.values(node.inputs)) {if (link(value)) {pending.push(value[0]);}}
  }
  return retained;
}

export class ComfyGpuClient {
  private info: Promise<ComfyObjectInfo> | undefined;
  constructor(private readonly apiKey: string) {}
  protected createClient(): Comfy {
    return new Comfy({ apiKey: this.apiKey, clientInfo: "nodetool-gpu-models", fetch: comfyCloudFetch(this.apiKey) });
  }
  protected objectInfo(): Promise<ComfyObjectInfo> {
    this.info ??= (async () => {
      const response = await fetchWithRetry("https://cloud.comfy.org/api/object_info", { headers: { "X-API-Key": this.apiKey }, signal: AbortSignal.timeout(30_000) });
      if (!response.ok) {throw new Error(`Comfy Cloud catalog request failed: HTTP ${response.status}`);}
      return response.json();
    })();
    this.info.catch(() => { this.info = undefined; });
    return this.info;
  }
  async run(template: ComfyGpuTemplate, input: ComfyGpuInput): Promise<{ data: Uint8Array; mimeType: string }> {
    if (!this.apiKey.trim()) {throw new Error("COMFY_API_KEY is required for Comfy GPU models");}
    if (template.restricted && process.env[COMFY_RESTRICTED_MODELS_ENV] !== "1") {throw new Error(`${template.name} requires ${COMFY_RESTRICTED_MODELS_ENV}=1 where its model license permits use`);}
    let jobId: string | undefined;
    try {
      return await this.execute(template, input, (id) => { jobId = id; });
    } catch (error) {
      throw comfyJobError(template.name, jobId, error);
    }
  }

  private async execute(template: ComfyGpuTemplate, input: ComfyGpuInput, submitted: (id: string) => void): Promise<{ data: Uint8Array; mimeType: string }> {
    const supplied = { image: input.images ?? [], video: input.videos ?? [], audio: input.audios ?? [] };
    // The catalog's counts reject a known mismatch before the object_info fetch.
    if (template.inputs) {fitMedia(template, template.inputs, supplied);}
    const signal = input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout((input.timeoutSeconds ?? 900) * 1000)]) : AbortSignal.timeout((input.timeoutSeconds ?? 900) * 1000);
    signal.throwIfAborted();
    const pinned = COMFY_TEMPLATES.find((entry) => entry.source === template.source);
    const graph = prepareComfyGpuPrompt(pinned ? structuredClone(pinned.graph) : comfyUiToPrompt(template.workflow, await this.objectInfo()), template, input);
    const client = this.createClient();
    const workflow = client.workflows.fromJson(graph);
    const loaders: Record<keyof typeof sources, Array<[string, string]>> = { image: [], video: [], audio: [] };
    for (const [id, node] of Object.entries(graph)) {
      if (node.class_type === "LoadImage") {loaders.image.push([id, "image"]);}
      if (node.class_type === "LoadAudio") {loaders.audio.push([id, "audio"]);}
      if (/^(LoadVideo|VHS_LoadVideo)/.test(node.class_type)) {
        loaders.video.push([id, "file" in node.inputs ? "file" : "video"]);
      }
    }
    const sources = fitMedia(template, { image: loaders.image.length, video: loaders.video.length, audio: loaders.audio.length }, supplied);
    for (const kind of ["image", "video", "audio"] as const) {
      loaders[kind].forEach(([id, field], index) => {
        const bytes = sources[kind][index];
        if (!bytes?.length) {throw new Error(`Comfy GPU ${kind} input is empty`);}
        const mimeType = sniffMime(bytes, kind === "image" ? "image/png" : kind === "video" ? "video/mp4" : "audio/wav");
        const extension = mimeType.split("/")[1].replace("jpeg", "jpg");
        workflow.setInput(id, field, client.assets.fromBytes(bytes, { filename: `input-${kind}-${index}.${extension}`, contentType: mimeType }));
      });
    }
    signal.throwIfAborted();
    // The key also authenticates partner nodes inside the graph (e.g. TextGenerateLTX2Prompt).
    const job = await client.submit(workflow, { signal, apiKey: this.apiKey });
    submitted(job.id);
    const cancel = (): void => { void job.cancel().catch(() => { /* A terminal job needs no further cancellation. */ }); };
    signal.addEventListener("abort", cancel, { once: true });
    try {
      if (signal.aborted) { cancel(); signal.throwIfAborted(); }
      await job.wait((input.timeoutSeconds ?? 900) * 1000, signal);
      if (job.status !== "succeeded") {throw new Error(job.error?.message ?? `ended ${job.status}`);}
      const matches = (file: (typeof job.outputs)[number]): boolean => template.kind === "model3d" ? /\.(glb|gltf|obj|ply|stl|fbx)$/i.test(file.name) :
        file.contentType.startsWith(`${template.kind}/`) || template.kind === "text" && file.type === "text";
      const output = template.outputNodes.map((id) => job.outputs.find((file) => file.nodeId === id && matches(file))).find((file) => file !== undefined)
        ?? job.outputs.find(matches);
      if (!output) {throw new Error(`finished without a ${template.kind} output`);}
      return { data: new Uint8Array(await output.toBytes({ signal })), mimeType: output.contentType };
    } finally { signal.removeEventListener("abort", cancel); }
  }
}
