/** Model/task catalog for workflows executed on Comfy Cloud's GPUs. */
import { Comfy } from "@comfyorg/sdk";
import { loadPackageAssetJson } from "@nodetool-ai/config";
import type { ComfyApiPrompt, ComfyObjectInfo } from "@nodetool-ai/protocol";
import { COMFY_TEMPLATES } from "./comfy-template-graphs.js";
import { COMFY_RESTRICTED_MODELS_ENV } from "./comfy-workflow-models.js";
import { comfyUiToPrompt } from "./comfy-ui-prompt.js";
import { fetchWithRetry } from "./http-transport.js";
import { sniffMime } from "./comfy-router.js";

export interface ComfyGpuTemplate {
  readonly id: string;
  readonly source: string;
  readonly name: string;
  readonly models: readonly string[];
  readonly kind: "image" | "video" | "audio" | "text" | "model3d";
  readonly task: string;
  readonly restricted: boolean;
  readonly outputNodes: readonly string[];
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
    return new Comfy({ apiKey: this.apiKey, clientInfo: "nodetool-gpu-models", fetch: (request, init) =>
      fetchWithRetry(request instanceof Request ? request.url : String(request), init, { fetchImpl: (_url, retryInit) => fetch(request, retryInit) }) });
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
    const signal = input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout((input.timeoutSeconds ?? 900) * 1000)]) : AbortSignal.timeout((input.timeoutSeconds ?? 900) * 1000);
    signal.throwIfAborted();
    const pinned = COMFY_TEMPLATES.find((entry) => entry.source === template.source);
    const graph = prepareComfyGpuPrompt(pinned ? structuredClone(pinned.graph) : comfyUiToPrompt(template.workflow, await this.objectInfo()), template, input);
    const client = this.createClient();
    const workflow = client.workflows.fromJson(graph);
    const sources = { image: input.images ?? [], video: input.videos ?? [], audio: input.audios ?? [] };
    const loaders: Record<keyof typeof sources, Array<[string, string]>> = { image: [], video: [], audio: [] };
    for (const [id, node] of Object.entries(graph)) {
      if (node.class_type === "LoadImage") {loaders.image.push([id, "image"]);}
      if (node.class_type === "LoadAudio") {loaders.audio.push([id, "audio"]);}
      if (/^(LoadVideo|VHS_LoadVideo)/.test(node.class_type)) {
        loaders.video.push([id, "file" in node.inputs ? "file" : "video"]);
      }
    }
    for (const kind of ["image", "video", "audio"] as const) {
      if (loaders[kind].length !== sources[kind].length) {throw new Error(`${template.name} requires ${loaders[kind].length} ${kind} input(s), received ${sources[kind].length}`);}
    }
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
    const job = await client.submit(workflow, { signal });
    const cancel = (): void => { void job.cancel().catch(() => { /* A terminal job needs no further cancellation. */ }); };
    signal.addEventListener("abort", cancel, { once: true });
    try {
      if (signal.aborted) { cancel(); signal.throwIfAborted(); }
      await job.wait((input.timeoutSeconds ?? 900) * 1000, signal);
      if (job.status !== "succeeded") {throw new Error(`Comfy job ${job.id} ended ${job.status}${job.error ? `: ${job.error.message}` : ""}`);}
      const matches = (file: (typeof job.outputs)[number]): boolean => template.kind === "model3d" ? /\.(glb|gltf|obj|ply|stl|fbx)$/i.test(file.name) :
        file.contentType.startsWith(`${template.kind}/`) || template.kind === "text" && file.type === "text";
      const output = template.outputNodes.map((id) => job.outputs.find((file) => file.nodeId === id && matches(file))).find((file) => file !== undefined)
        ?? job.outputs.find(matches);
      if (!output) {throw new Error(`Comfy job ${job.id} finished without a ${template.kind} output`);}
      return { data: new Uint8Array(await output.toBytes({ signal })), mimeType: output.contentType };
    } finally { signal.removeEventListener("abort", cancel); }
  }
}
