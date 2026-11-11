/** Official API templates shared by the model provider and editable examples. */
import { Comfy } from "@comfyorg/sdk";
import type { ComfyApiPrompt } from "@nodetool-ai/protocol";
import type { ComfyApiGraph } from "./comfy-workflow-models.js";
import { COMFY_RESTRICTED_MODELS_ENV } from "./comfy-workflow-models.js";
import { COMFY_TEMPLATES } from "./comfy-template-graphs.js";
import { comfyCloudFetch } from "./comfy-fetch.js";
import { comfyJobError } from "./comfy-gpu-models.js";

type Binding = readonly [node: string, input: string];

interface TemplateBase {
  readonly id: string;
  readonly source: string;
  readonly sourceUrl: string;
  readonly name: string;
  readonly graph: Readonly<ComfyApiPrompt>;
  readonly prompt: readonly Binding[];
  readonly seeds: readonly Binding[];
  readonly output: string;
  readonly restricted?: boolean;
}

export type ComfyTemplate = TemplateBase & (
  | { readonly task: "text_to_audio" }
  | { readonly task: "text_to_image"; readonly size: string; readonly multiple: number }
  | {
    readonly task: "text_to_video";
    readonly size: string;
    readonly multiple: number;
    readonly fps: number;
    readonly maxFrames: number;
    readonly grid: number;
    readonly offset: number;
    readonly width: number;
    readonly height: number;
  }
);

export { COMFY_TEMPLATES };

export function comfyTemplate(id: string): ComfyTemplate | undefined {
  return COMFY_TEMPLATES.find((template) => template.id === id);
}

export function listedComfyTemplates(env: Record<string, string | undefined>): readonly ComfyTemplate[] {
  return COMFY_TEMPLATES.filter((template) => !template.restricted || env[COMFY_RESTRICTED_MODELS_ENV] === "1");
}

export interface ComfyTemplateInput {
  readonly prompt: string;
  readonly seed?: number | null;
  readonly width?: number;
  readonly height?: number;
  readonly aspectRatio?: string | null;
  readonly durationSeconds?: number | null;
  readonly numFrames?: number | null;
  readonly timeoutSeconds?: number | null;
  readonly signal?: AbortSignal;
}

function positiveFinite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Build a fresh prompt, replacing size links without changing the pinned graph. */
export function comfyTemplateGraph(template: ComfyTemplate, input: ComfyTemplateInput): ComfyApiGraph {
  const graph = structuredClone(template.graph);
  for (const [node, field] of template.prompt) {
    graph[node].inputs[field] = input.prompt;
  }
  const seed = typeof input.seed === "number" && Number.isFinite(input.seed) && input.seed >= 0
    ? Math.floor(input.seed)
    : Math.floor(Math.random() * 2 ** 31);
  for (const [node, field] of template.seeds) {
    graph[node].inputs[field] = seed;
  }
  if (template.task === "text_to_audio") {
    return graph;
  }
  const [rw, rh] = (input.aspectRatio ?? (template.task === "text_to_image" ? "1:1" : "16:9")).split(":").map(Number);
  if (!positiveFinite(rw) || !positiveFinite(rh)) {
    throw new Error("Comfy template aspect ratio must contain two positive numbers");
  }
  const defaultWidth = template.task === "text_to_image" ? 1024 : template.width;
  const defaultHeight = template.task === "text_to_image" ? 1024 : template.height;
  const area = defaultWidth * defaultHeight;
  const snap = (value: number): number => Math.max(template.multiple, Math.round(value / template.multiple) * template.multiple);
  const width = snap(positiveFinite(input.width) ? input.width : Math.sqrt(area * rw / rh));
  const height = snap(positiveFinite(input.height) ? input.height : Math.sqrt(area * rh / rw));
  Object.assign(graph[template.size].inputs, { width, height });
  if (template.task === "text_to_video") {
    const requested = positiveFinite(input.numFrames) ? input.numFrames
      : (positiveFinite(input.durationSeconds) ? input.durationSeconds : 5) * template.fps + template.offset;
    const frames = Math.max(template.grid + template.offset,
      Math.floor((Math.min(template.maxFrames, requested) - template.offset) / template.grid) * template.grid + template.offset);
    graph[template.size].inputs.length = frames;
  }
  return graph;
}

/** Run a selected image/video template directly through Comfy's job API. */
export async function runComfyTemplate(
  template: ComfyTemplate,
  apiKey: string,
  input: ComfyTemplateInput
): Promise<Uint8Array> {
  if (template.task === "text_to_audio") {
    throw new Error("Music templates run through their editable workflow, not the speech provider");
  }
  if (template.restricted && process.env[COMFY_RESTRICTED_MODELS_ENV] !== "1") {
    throw new Error(`${template.name} requires ${COMFY_RESTRICTED_MODELS_ENV}=1 where its model license permits use`);
  }
  if (!apiKey.trim()) {
    throw new Error("COMFY_API_KEY is required for Comfy templates");
  }
  if (!input.prompt.trim()) {
    throw new Error("The Comfy template needs a prompt");
  }
  const timeout = positiveFinite(input.timeoutSeconds) ? input.timeoutSeconds : 900;
  const signal = input.signal
    ? AbortSignal.any([input.signal, AbortSignal.timeout(timeout * 1000)])
    : AbortSignal.timeout(timeout * 1000);
  signal.throwIfAborted();
  const client = new Comfy({
    apiKey,
    clientInfo: "nodetool-templates",
    fetch: comfyCloudFetch(apiKey)
  });
  const workflow = client.workflows.fromJson(comfyTemplateGraph(template, input));
  // No automatic resubmission: a submitted job may already have incurred a charge.
  // The key also authenticates partner nodes inside the graph.
  let job: Awaited<ReturnType<typeof client.submit>>;
  try {
    job = await client.submit(workflow, { signal, apiKey });
  } catch (error) {
    throw comfyJobError(template.name, undefined, error);
  }
  const cancel = (): void => {
    void job.cancel().catch(() => {
      // Cancellation can race a terminal job state.
    });
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    return await readTemplateOutput(job, template, timeout, signal, cancel);
  } catch (error) {
    throw comfyJobError(template.name, job.id, error);
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}

async function readTemplateOutput(
  job: Awaited<ReturnType<Comfy["submit"]>>,
  template: ComfyTemplate,
  timeout: number,
  signal: AbortSignal,
  cancel: () => void
): Promise<Uint8Array> {
  if (signal.aborted) {
    cancel();
    signal.throwIfAborted();
  }
  await job.wait(timeout * 1000, signal);
  if (job.status !== "succeeded") {
    throw new Error(job.error?.message ?? `ended ${job.status}`);
  }
  const kind = template.task === "text_to_image" ? "image/" : "video/";
  const output = job.getOutputs(template.output).find((file) => file.contentType.startsWith(kind));
  if (!output) {
    throw new Error(`finished without the template's ${kind} output`);
  }
  return new Uint8Array(await output.toBytes({ signal }));
}
