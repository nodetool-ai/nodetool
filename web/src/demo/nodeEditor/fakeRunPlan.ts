/**
 * Plans the protocol messages a run of the node editor demo emits.
 *
 * The marketing-site node editor has no backend. When a visitor presses Run,
 * `fakeRunTransport` hands the submitted `run_job` request to `planFakeRun`,
 * which walks the graph in dependency order and returns the same messages a
 * server run streams (`job_update`, `node_update`, `node_progress`, `chunk`,
 * `edge_update`, `output_update`), stamped with an offset in milliseconds.
 *
 * The demo's media provider is fake. Generation nodes return one of a few
 * pre-made sample stills and clips, picked by words in the prompt, and
 * Image To Video returns the clip made from the still it receives. Nothing
 * here calls a model.
 */
import type { CastEvent } from "../castTypes";
import { isString } from "../../utils/typePredicates";

/** One pre-made still and the clip made from it. */
export interface DemoSample {
  key: string;
  /** Words in a prompt that pick this sample. */
  keywords: readonly string[];
  image: string;
  video: string;
}

const SAMPLE_KEYS = [
  { key: "lighthouse", keywords: ["lighthouse", "coast", "sea", "ocean", "cliff", "volcan", "wave", "landscape"] },
  { key: "coffee", keywords: ["coffee", "espresso", "bean", "cup", "latte", "breakfast", "cafe"] },
  { key: "headphones", keywords: ["headphone", "product", "audio", "music", "speaker", "studio", "pedestal"] },
  { key: "tumbler", keywords: ["tumbler", "bottle", "mug", "kitchen", "window", "morning", "flask"] }
] as const;

/** Where the marketing site serves the sample media. */
export const DEMO_MEDIA_BASE = "/node-editor-demo/";

export const DEMO_SAMPLES: readonly DemoSample[] = SAMPLE_KEYS.map((sample) => ({
  ...sample,
  image: `${DEMO_MEDIA_BASE}${sample.key}.webp`,
  video: `${DEMO_MEDIA_BASE}${sample.key}.mp4`
}));

/** Node types the demo can run. Anything else fails with a clear message. */
export const DEMO_NODE_TYPES = {
  stringInput: "nodetool.input.StringInput",
  constantString: "nodetool.constant.String",
  enhancePrompt: "nodetool.agents.EnhancePrompt",
  textToImage: "nodetool.image.TextToImage",
  textToVideo: "nodetool.video.TextToVideo",
  imageToVideo: "nodetool.video.ImageToVideo",
  preview: "nodetool.workflows.base_node.Preview"
} as const;

interface GraphNodeLike {
  id: string;
  type: string;
  data?: Record<string, unknown>;
  ui_properties?: { title?: string } | null;
}

interface GraphEdgeLike {
  id?: string | null;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  edge_type?: string | null;
}

export interface FakeRunRequest {
  job_id: string;
  workflow_id: string;
  graph: { nodes: GraphNodeLike[]; edges: GraphEdgeLike[] };
}

interface ImageRefLike {
  type: "image";
  uri: string;
}

interface VideoRefLike {
  type: "video";
  uri: string;
}

/** Stable small hash so the same prompt always gets the same sample. */
function hashText(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** The sample a prompt asks for: the first keyword match, else by hash. */
export function pickSample(prompt: string): DemoSample {
  const lower = prompt.toLowerCase();
  const match = DEMO_SAMPLES.find((sample) =>
    sample.keywords.some((word) => lower.includes(word))
  );
  return match ?? DEMO_SAMPLES[hashText(lower) % DEMO_SAMPLES.length];
}

function sampleForImage(uri: string): DemoSample | undefined {
  return DEMO_SAMPLES.find((sample) => sample.image === uri);
}

const ENHANCE_SUFFIX =
  ", golden hour light, shallow depth of field, rich texture, 35 mm film look, cinematic composition";

/** The fake LLM's rewrite: the draft plus a fixed set of camera words. */
export function enhanceDraft(draft: string): string {
  const trimmed = draft.trim().replace(/[.\s]+$/, "");
  const base = trimmed.length > 0 ? trimmed : "A quiet scene";
  return `${base.charAt(0).toUpperCase()}${base.slice(1)}${ENHANCE_SUFFIX}.`;
}

/** Split text into word groups so it streams like an LLM. */
function tokenize(text: string): string[] {
  const words = text.split(/(?<=\s)/);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += 3) {
    chunks.push(words.slice(i, i + 3).join(""));
  }
  return chunks;
}

function firstImage(value: unknown): ImageRefLike | undefined {
  const candidates = Array.isArray(value) ? value : [value];
  for (const item of candidates) {
    if (
      typeof item === "object" &&
      item !== null &&
      (item as { type?: unknown }).type === "image" &&
      isString((item as { uri?: unknown }).uri) &&
      (item as { uri: string }).uri.length > 0
    ) {
      return item as ImageRefLike;
    }
  }
  return undefined;
}

/**
 * Order nodes so every node follows its inputs. Returns null when the graph
 * has a cycle.
 */
export function topologicalOrder(
  nodes: GraphNodeLike[],
  edges: GraphEdgeLike[]
): GraphNodeLike[] | null {
  const indegree = new Map<string, number>(nodes.map((node) => [node.id, 0]));
  const downstream = new Map<string, string[]>();
  for (const edge of edges) {
    if (!indegree.has(edge.source) || !indegree.has(edge.target)) {
      continue;
    }
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    downstream.set(edge.source, [...(downstream.get(edge.source) ?? []), edge.target]);
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  const ordered: GraphNodeLike[] = [];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    const node = byId.get(id);
    if (node) {
      ordered.push(node);
    }
    for (const next of downstream.get(id) ?? []) {
      const left = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, left);
      if (left === 0) {
        queue.push(next);
      }
    }
  }
  return ordered.length === nodes.length ? ordered : null;
}

/** How long each kind of node "works", in milliseconds. */
const DURATION_MS = {
  instant: 250,
  enhance: 2200,
  image: 2600,
  video: 4200,
  preview: 200
} as const;

/** Pause between one node finishing and the next starting. */
const HANDOFF_MS = 250;

/**
 * Plan a full run. The result is sorted by `t` and always ends in a terminal
 * `job_update` (`completed`, or `failed` with the reason).
 */
export function planFakeRun(request: FakeRunRequest): CastEvent[] {
  const base = { workflow_id: request.workflow_id, job_id: request.job_id };
  const events: CastEvent[] = [];
  const push = (t: number, message: { type: string; [key: string]: unknown }): void => {
    events.push({ t, message: { ...message, ...base } });
  };
  const { nodes } = request.graph;
  const edges = request.graph.edges.filter((edge) => edge.edge_type !== "control");

  push(0, { type: "job_update", status: "running" });

  const order = topologicalOrder(nodes, edges);
  if (order === null) {
    push(HANDOFF_MS, {
      type: "job_update",
      status: "failed",
      error: "The graph has a loop. Remove one connection and run again."
    });
    return byTime(events);
  }

  const outputs = new Map<string, Record<string, unknown>>();
  const hasOutgoing = (nodeId: string, handle: string): boolean =>
    edges.some((edge) => edge.source === nodeId && edge.sourceHandle === handle);

  /** Property values, with connected inputs replaced by upstream outputs. */
  const inputsOf = (node: GraphNodeLike): Record<string, unknown> => {
    const values: Record<string, unknown> = { ...(node.data ?? {}) };
    for (const edge of edges) {
      if (edge.target !== node.id) {
        continue;
      }
      const upstream = outputs.get(edge.source);
      if (upstream && edge.sourceHandle in upstream) {
        values[edge.targetHandle] = upstream[edge.sourceHandle];
      }
    }
    return values;
  };

  let t = HANDOFF_MS;
  let jobResult: Record<string, unknown> = {};

  for (const node of order) {
    const name = node.ui_properties?.title ?? node.type.split(".").pop() ?? node.type;
    const nodeUpdate = (at: number, status: string, extra: Record<string, unknown> = {}): void =>
      push(at, {
        type: "node_update",
        status,
        node_id: node.id,
        node_name: name,
        node_type: node.type,
        ...extra
      });
    const incoming = edges.filter((edge) => edge.target === node.id);
    for (const edge of incoming) {
      if (edge.id) {
        push(t, { type: "edge_update", edge_id: edge.id, status: "active" });
      }
    }
    const inputs = inputsOf(node);
    const prompt = isString(inputs.prompt) ? inputs.prompt : "";
    nodeUpdate(t, "running");

    let result: Record<string, unknown>;
    let duration: number = DURATION_MS.instant;

    switch (node.type) {
      case DEMO_NODE_TYPES.stringInput:
      case DEMO_NODE_TYPES.constantString: {
        result = { output: isString(inputs.value) ? inputs.value : "" };
        break;
      }
      case DEMO_NODE_TYPES.enhancePrompt: {
        const text = enhanceDraft(prompt);
        const tokens = tokenize(text);
        duration = DURATION_MS.enhance;
        tokens.forEach((content, i) => {
          push(Math.round(t + 300 + ((duration - 400) * i) / tokens.length), {
            type: "chunk",
            node_id: node.id,
            content_type: "text",
            content
          });
        });
        result = { text };
        break;
      }
      case DEMO_NODE_TYPES.textToImage: {
        duration = DURATION_MS.image;
        const image: ImageRefLike = { type: "image", uri: pickSample(prompt).image };
        result = { output: image };
        break;
      }
      case DEMO_NODE_TYPES.textToVideo: {
        duration = DURATION_MS.video;
        const video: VideoRefLike = { type: "video", uri: pickSample(prompt).video };
        result = { output: video };
        break;
      }
      case DEMO_NODE_TYPES.imageToVideo: {
        const source = firstImage(inputs.image);
        if (!source) {
          nodeUpdate(t + DURATION_MS.instant, "error", {
            error: "Image To Video needs an image. Connect Text To Image to its Images input."
          });
          push(t + DURATION_MS.instant + HANDOFF_MS, {
            type: "job_update",
            status: "failed",
            error: "Image To Video needs an image."
          });
          return byTime(events);
        }
        duration = DURATION_MS.video;
        const sample = sampleForImage(source.uri) ?? pickSample(prompt);
        const video: VideoRefLike = { type: "video", uri: sample.video };
        result = { output: video };
        break;
      }
      case DEMO_NODE_TYPES.preview: {
        duration = DURATION_MS.preview;
        result = { output: inputs.value ?? null };
        push(t + duration, {
          type: "output_update",
          node_id: node.id,
          node_name: name,
          output_name: "output",
          value: inputs.value ?? null,
          output_type: "any",
          metadata: {}
        });
        break;
      }
      default: {
        nodeUpdate(t + DURATION_MS.instant, "error", {
          error: "This demo runs only the nodes in its menu."
        });
        push(t + DURATION_MS.instant + HANDOFF_MS, {
          type: "job_update",
          status: "failed",
          error: `${name} can't run in this demo.`
        });
        return byTime(events);
      }
    }

    if (duration >= DURATION_MS.image) {
      const steps = 10;
      for (let step = 1; step <= steps; step++) {
        push(Math.round(t + (duration * step) / (steps + 1)), {
          type: "node_progress",
          node_id: node.id,
          progress: step,
          total: steps
        });
      }
    }

    t += duration;
    for (const [handle, value] of Object.entries(result)) {
      if (node.type !== DEMO_NODE_TYPES.preview && !hasOutgoing(node.id, handle)) {
        push(t, {
          type: "output_update",
          node_id: node.id,
          node_name: name,
          output_name: handle,
          value,
          output_type: "any",
          metadata: {}
        });
        jobResult = { ...jobResult, [handle]: value };
      }
    }
    nodeUpdate(t, "completed", { result });
    outputs.set(node.id, result);
    for (const edge of incoming) {
      if (edge.id) {
        push(t, { type: "edge_update", edge_id: edge.id, status: "completed" });
      }
    }
    t += HANDOFF_MS;
  }

  push(t, { type: "job_update", status: "completed", result: { outputs: jobResult } });
  return byTime(events);
}

function byTime(events: CastEvent[]): CastEvent[] {
  return [...events].sort((a, b) => a.t - b.t);
}
