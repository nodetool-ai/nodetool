/**
 * The pinned open-weights ComfyUI workflow behind the "Wan 2.2 TI2V 5B
 * (ComfyUI workflow)" clip model, run on Comfy Cloud through the Comfy API v2.
 *
 * This path submits a real ComfyUI graph (core nodes, Wan 2.2 weights) and is
 * separate from Comfy Router, which calls partner models by id. The same
 * graph ships in the "Shot Director" example workflow so it can be opened and
 * edited; `tests/providers/comfy-workflow-models.test.ts` keeps the two equal.
 */

import { Comfy } from "@comfyorg/sdk";

/** Model id the storyboard's clip picker lists and the preset compiler maps to `local-wan`. */
export const COMFY_WAN22_TI2V_MODEL_ID = "comfyui-workflow/wan2.2-ti2v-5b";

/** ComfyUI API-format graph: Wan 2.2 TI2V 5B image-to-video. */
export const WAN22_TI2V_GRAPH: Readonly<Record<string, { class_type: string; inputs: Record<string, unknown> }>> = {
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

/** Graph node ids the shot's still, prompt, seed and size are written into. */
const NODE = {
  sampler: "3",
  positive: "6",
  latent: "55",
  image: "56",
  video: "58"
} as const;

const FPS = 24;
/** Wan 2.2 TI2V 5B is trained for up to 121 frames (5 s at 24 fps). */
const MAX_FRAMES = 121;

export function isComfyWorkflowModel(modelId: string): boolean {
  return modelId === COMFY_WAN22_TI2V_MODEL_ID;
}

/** Wan latents need 4n+1 frames. */
export function wanFrameCount(durationSeconds: number | null | undefined): number {
  const seconds = durationSeconds && durationSeconds > 0 ? durationSeconds : 5;
  const raw = Math.min(MAX_FRAMES, Math.round(seconds * FPS) + 1);
  return Math.max(5, Math.floor((raw - 1) / 4) * 4 + 1);
}

/** The model's native 1280x704 canvas, turned for portrait and square shots. */
export function wanCanvas(aspectRatio: string | null | undefined): { width: number; height: number } {
  const [w, h] = (aspectRatio ?? "16:9").split(":").map(Number);
  if (!w || !h || w === h) {
    return w && h ? { width: 960, height: 960 } : { width: 1280, height: 704 };
  }
  return w > h ? { width: 1280, height: 704 } : { width: 704, height: 1280 };
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

/** Fill the pinned graph with one shot's inputs. Pure, so tests can check the mapping. */
export function wan22Graph(
  input: Omit<ComfyWorkflowRunInput, "apiKey" | "image" | "imageMime" | "signal" | "timeoutSeconds">
): Record<string, { class_type: string; inputs: Record<string, unknown> }> {
  const graph = JSON.parse(JSON.stringify(WAN22_TI2V_GRAPH)) as Record<
    string,
    { class_type: string; inputs: Record<string, unknown> }
  >;
  const { width, height } = wanCanvas(input.aspectRatio);
  graph[NODE.positive].inputs.text = input.prompt;
  graph[NODE.sampler].inputs.seed =
    input.seed != null && input.seed >= 0
      ? Math.floor(input.seed)
      : Math.floor(Math.random() * 2 ** 31);
  graph[NODE.latent].inputs.width = width;
  graph[NODE.latent].inputs.height = height;
  graph[NODE.latent].inputs.length = wanFrameCount(input.durationSeconds);
  return graph;
}

/** Run the pinned graph on Comfy Cloud and return the MP4 bytes. */
export async function runWan22Workflow(input: ComfyWorkflowRunInput): Promise<Uint8Array> {
  if (!input.prompt.trim()) {
    throw new Error("The ComfyUI workflow needs a prompt.");
  }
  if (input.image.length === 0) {
    throw new Error("The ComfyUI workflow needs the shot's still. Generate or pick a still first.");
  }
  const client = new Comfy({ apiKey: input.apiKey, clientInfo: "nodetool-storyboard" });
  const workflow = client.workflows.fromJson(wan22Graph(input));
  const ext = input.imageMime === "image/jpeg" ? "jpg" : input.imageMime === "image/webp" ? "webp" : "png";
  workflow.setInput(
    NODE.image,
    "image",
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
    job.getOutputs(NODE.video).find((o) => o.contentType.startsWith("video/")) ??
    job.outputs.find((o) => o.contentType.startsWith("video/"));
  if (!output) {
    throw new Error(`Comfy job ${job.id} finished without a video output`);
  }
  return new Uint8Array(await output.toBytes({ signal: input.signal }));
}
