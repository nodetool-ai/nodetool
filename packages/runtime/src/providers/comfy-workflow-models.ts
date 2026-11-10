/**
 * Pinned open-weights ComfyUI workflows that the `comfy_cloud` provider lists
 * as image-to-video models and runs on Comfy Cloud through the Comfy API v2.
 *
 * This path submits real ComfyUI graphs (core nodes, open weights) and is
 * separate from Comfy Router, which calls partner models by id. Each graph
 * also ships in an editable "Shot Director" example workflow;
 * `tests/providers/comfy-workflow-models.test.ts` keeps them equal.
 */

import { Comfy } from "@comfyorg/sdk";
import { comfyCloudFetch } from "./comfy-fetch.js";

import {
  LTX23_I2V_GRAPH,
  MINIMAX_H3_I2V_GRAPH,
  WAN22_I2V_A14B_GRAPH
} from "./comfy-workflow-graphs.js";

export type ComfyApiGraph = Readonly<
  Record<string, { class_type: string; inputs: Record<string, unknown> }>
>;
type MutableGraph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

export const COMFY_WAN22_TI2V_MODEL_ID = "comfyui-workflow/wan2.2-ti2v-5b";
export const COMFY_WAN22_I2V_A14B_MODEL_ID = "comfyui-workflow/wan2.2-i2v-a14b";
export const COMFY_LTX23_I2V_MODEL_ID = "comfyui-workflow/ltx-2.3-i2v";
export const COMFY_MINIMAX_H3_I2V_MODEL_ID = "comfyui-workflow/minimax-h3-i2v";

/** ComfyUI API-format graph: Wan 2.2 TI2V 5B image-to-video. */
export const WAN22_TI2V_GRAPH: ComfyApiGraph = {
  "3": {
    "class_type": "KSampler",
    "inputs": {
      "seed": 42,
      "steps": 20,
      "cfg": 5,
      "sampler_name": "uni_pc",
      "scheduler": "simple",
      "denoise": 1,
      "model": [
        "48",
        0
      ],
      "positive": [
        "6",
        0
      ],
      "negative": [
        "7",
        0
      ],
      "latent_image": [
        "55",
        0
      ]
    }
  },
  "6": {
    "class_type": "CLIPTextEncode",
    "inputs": {
      "text": "A cinematic shot.",
      "clip": [
        "38",
        0
      ]
    }
  },
  "7": {
    "class_type": "CLIPTextEncode",
    "inputs": {
      "text": "blurry, low quality, distorted, deformed, flicker, watermark, text, subtitles, jump cut, static frame, overexposed",
      "clip": [
        "38",
        0
      ]
    }
  },
  "8": {
    "class_type": "VAEDecode",
    "inputs": {
      "samples": [
        "3",
        0
      ],
      "vae": [
        "39",
        0
      ]
    }
  },
  "37": {
    "class_type": "UNETLoader",
    "inputs": {
      "unet_name": "wan2.2_ti2v_5B_fp16.safetensors",
      "weight_dtype": "default"
    }
  },
  "38": {
    "class_type": "CLIPLoader",
    "inputs": {
      "clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
      "type": "wan",
      "device": "default"
    }
  },
  "39": {
    "class_type": "VAELoader",
    "inputs": {
      "vae_name": "wan2.2_vae.safetensors"
    }
  },
  "48": {
    "class_type": "ModelSamplingSD3",
    "inputs": {
      "shift": 8,
      "model": [
        "37",
        0
      ]
    }
  },
  "55": {
    "class_type": "Wan22ImageToVideoLatent",
    "inputs": {
      "width": 1280,
      "height": 704,
      "length": 121,
      "batch_size": 1,
      "vae": [
        "39",
        0
      ],
      "start_image": [
        "56",
        0
      ]
    }
  },
  "56": {
    "class_type": "LoadImage",
    "inputs": {
      "image": "input.png"
    }
  },
  "57": {
    "class_type": "CreateVideo",
    "inputs": {
      "fps": 24,
      "images": [
        "8",
        0
      ]
    }
  },
  "58": {
    "class_type": "SaveVideo",
    "inputs": {
      "filename_prefix": "video/shot-director",
      "format": "auto",
      "codec": "auto",
      "video": [
        "57",
        0
      ]
    }
  }
};

type Canvas = { width: number; height: number };

/** Where one pinned graph takes a shot's inputs, and the clip shapes it can make. */
export interface ComfyWorkflowModel {
  id: string;
  name: string;
  graph: ComfyApiGraph;
  fps: number;
  maxFrames: number;
  /** Frame counts the model's latent accepts: `step * n + offset`. */
  frameGrid: { step: number; offset: number };
  canvas: { landscape: Canvas; portrait: Canvas; square: Canvas };
  prompt: [node: string, input: string];
  /** Every noise seed in the graph; the first takes the shot's seed. */
  seeds: Array<[node: string, input: string]>;
  image: [node: string, input: string];
  video: string;
  /** Write the canvas and frame count into the graph. */
  shape: (graph: MutableGraph, canvas: Canvas, frames: number) => void;
  /** Set only for models whose license restricts where they may be used. */
  licenseNote?: string;
}

export const COMFY_WORKFLOW_MODELS: readonly ComfyWorkflowModel[] = [
  {
    id: COMFY_WAN22_TI2V_MODEL_ID,
    name: "Wan 2.2 TI2V 5B (ComfyUI workflow, open weights)",
    graph: WAN22_TI2V_GRAPH,
    fps: 24,
    maxFrames: 121,
    frameGrid: { step: 4, offset: 1 },
    canvas: {
      landscape: { width: 1280, height: 704 },
      portrait: { width: 704, height: 1280 },
      square: { width: 960, height: 960 }
    },
    prompt: ["6", "text"],
    seeds: [["3", "seed"]],
    image: ["56", "image"],
    video: "58",
    shape: (graph, { width, height }, frames) => {
      Object.assign(graph["55"].inputs, { width, height, length: frames });
    }
  },
  {
    id: COMFY_WAN22_I2V_A14B_MODEL_ID,
    name: "Wan 2.2 I2V A14B (ComfyUI workflow, open weights)",
    graph: WAN22_I2V_A14B_GRAPH,
    fps: 16,
    maxFrames: 81,
    frameGrid: { step: 4, offset: 1 },
    canvas: {
      landscape: { width: 832, height: 480 },
      portrait: { width: 480, height: 832 },
      square: { width: 640, height: 640 }
    },
    prompt: ["93", "text"],
    seeds: [["86", "noise_seed"]],
    image: ["56", "image"],
    video: "58",
    shape: (graph, { width, height }, frames) => {
      Object.assign(graph["98"].inputs, { width, height, length: frames });
    }
  },
  {
    id: COMFY_LTX23_I2V_MODEL_ID,
    name: "LTX-2.3 22B (ComfyUI workflow, open weights, with audio)",
    graph: LTX23_I2V_GRAPH,
    fps: 24,
    maxFrames: 241,
    frameGrid: { step: 8, offset: 1 },
    canvas: {
      landscape: { width: 1280, height: 704 },
      portrait: { width: 704, height: 1280 },
      square: { width: 960, height: 960 }
    },
    prompt: ["6", "text"],
    seeds: [["16", "noise_seed"], ["26", "noise_seed"]],
    image: ["56", "image"],
    video: "58",
    // The first pass renders at half size; the latent upscaler doubles it.
    shape: (graph, { width, height }, frames) => {
      Object.assign(graph["10"].inputs, { width, height });
      Object.assign(graph["12"].inputs, { width: width / 2, height: height / 2, length: frames });
      graph["14"].inputs.frames_number = frames;
    }
  },
  {
    id: COMFY_MINIMAX_H3_I2V_MODEL_ID,
    name: "MiniMax H3 (ComfyUI workflow, restricted license, with audio)",
    graph: MINIMAX_H3_I2V_GRAPH,
    fps: 24,
    maxFrames: 362,
    frameGrid: { step: 17, offset: 5 },
    canvas: {
      landscape: { width: 864, height: 480 },
      portrait: { width: 480, height: 864 },
      square: { width: 640, height: 640 }
    },
    prompt: ["104", "prompt"],
    seeds: [["15", "noise_seed"]],
    image: ["56", "image"],
    video: "58",
    shape: (graph, { width, height }, frames) => {
      Object.assign(graph["104"].inputs, { width, height, length: frames });
    },
    licenseNote:
      "The MiniMax H3 Community License excludes the European Union, the United Kingdom, the United States and South Korea."
  }
];

/** Opt-in for models with a territorial license, such as MiniMax H3. */
export const COMFY_RESTRICTED_MODELS_ENV = "NODETOOL_COMFY_ENABLE_RESTRICTED_LICENSE_MODELS";

export function comfyWorkflowModel(modelId: string): ComfyWorkflowModel | undefined {
  return COMFY_WORKFLOW_MODELS.find((model) => model.id === modelId);
}

export function isComfyWorkflowModel(modelId: string): boolean {
  return comfyWorkflowModel(modelId) !== undefined;
}

/** The models to list: restricted-license ones only when opted in. */
export function listedComfyWorkflowModels(env: Record<string, string | undefined>): ComfyWorkflowModel[] {
  const restricted = env[COMFY_RESTRICTED_MODELS_ENV] === "1";
  return COMFY_WORKFLOW_MODELS.filter((model) => restricted || !model.licenseNote);
}

/** The longest frame count on the model's grid that fits the shot's duration and the model's limit. */
export function workflowFrameCount(
  model: ComfyWorkflowModel,
  durationSeconds: number | null | undefined
): number {
  const { step, offset } = model.frameGrid;
  const seconds = durationSeconds && durationSeconds > 0 ? durationSeconds : 5;
  const raw = Math.min(model.maxFrames, Math.round(seconds * model.fps) + offset);
  return Math.max(step + offset, Math.floor((raw - offset) / step) * step + offset);
}

/** Wan latents need 4n+1 frames; kept for the 5B model's callers. */
export function wanFrameCount(durationSeconds: number | null | undefined): number {
  return workflowFrameCount(COMFY_WORKFLOW_MODELS[0], durationSeconds);
}

/** The model's canvas for the board's aspect ratio. */
export function workflowCanvas(model: ComfyWorkflowModel, aspectRatio: string | null | undefined): Canvas {
  const [w, h] = (aspectRatio ?? "16:9").split(":").map(Number);
  if (!w || !h) {
    return model.canvas.landscape;
  }
  if (w === h) {
    return model.canvas.square;
  }
  return w > h ? model.canvas.landscape : model.canvas.portrait;
}

export function wanCanvas(aspectRatio: string | null | undefined): Canvas {
  return workflowCanvas(COMFY_WORKFLOW_MODELS[0], aspectRatio);
}

export interface ComfyWorkflowRunInput {
  apiKey: string;
  image: Uint8Array;
  imageMime: string;
  prompt: string;
  seed?: number | null;
  durationSeconds?: number | null;
  aspectRatio?: string | null;
  timeoutSeconds?: number | null;
  signal?: AbortSignal;
}

type GraphInput = Omit<ComfyWorkflowRunInput, "apiKey" | "image" | "imageMime" | "signal" | "timeoutSeconds">;

/** Fill a pinned graph with one shot's inputs. Pure, so tests can check the mapping. */
export function workflowGraph(model: ComfyWorkflowModel, input: GraphInput): MutableGraph {
  const graph = JSON.parse(JSON.stringify(model.graph)) as MutableGraph;
  const [promptNode, promptInput] = model.prompt;
  graph[promptNode].inputs[promptInput] = input.prompt;
  const seed =
    input.seed != null && input.seed >= 0 ? Math.floor(input.seed) : Math.floor(Math.random() * 2 ** 31);
  for (const [node, name] of model.seeds) {
    graph[node].inputs[name] = seed;
  }
  model.shape(graph, workflowCanvas(model, input.aspectRatio), workflowFrameCount(model, input.durationSeconds));
  return graph;
}

export function wan22Graph(input: GraphInput): MutableGraph {
  return workflowGraph(COMFY_WORKFLOW_MODELS[0], input);
}

/** Run a pinned graph on Comfy Cloud and return the MP4 bytes. */
export async function runComfyWorkflowModel(
  model: ComfyWorkflowModel,
  input: ComfyWorkflowRunInput
): Promise<Uint8Array> {
  if (!input.prompt.trim()) {
    throw new Error("The ComfyUI workflow needs a prompt.");
  }
  if (input.image.length === 0) {
    throw new Error("The ComfyUI workflow needs the shot's still. Generate or pick a still first.");
  }
  const client = new Comfy({ apiKey: input.apiKey, clientInfo: "nodetool-storyboard", fetch: comfyCloudFetch(input.apiKey) });
  const workflow = client.workflows.fromJson(workflowGraph(model, input));
  const ext = input.imageMime === "image/jpeg" ? "jpg" : input.imageMime === "image/webp" ? "webp" : "png";
  const [imageNode, imageInput] = model.image;
  workflow.setInput(
    imageNode,
    imageInput,
    client.assets.fromBytes(input.image, { filename: `shot-still.${ext}`, contentType: input.imageMime })
  );
  const job = await client.submit(workflow);
  const onAbort = (): void => {
    void job.cancel().catch(() => {
      // A job that already finished stays in its terminal state.
    });
  };
  input.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    await job.wait((input.timeoutSeconds ?? 900) * 1000, input.signal);
  } finally {
    input.signal?.removeEventListener("abort", onAbort);
  }
  if (job.status !== "succeeded") {
    const detail = job.error ? `: ${job.error.message}` : "";
    throw new Error(`Comfy job ${job.id} ended ${job.status}${detail}`);
  }
  // Comfy Cloud labels SaveVideo files `type: "image"`, so match on the node and content type.
  const output =
    job.getOutputs(model.video).find((o) => o.contentType.startsWith("video/")) ??
    job.outputs.find((o) => o.contentType.startsWith("video/"));
  if (!output) {
    throw new Error(`Comfy job ${job.id} finished without a video output`);
  }
  return new Uint8Array(await output.toBytes({ signal: input.signal }));
}
