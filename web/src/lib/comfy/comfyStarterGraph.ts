/**
 * The graph a new Comfy workflow starts from: ComfyUI's default text-to-image
 * graph, on FLUX.1 schnell so the first run on Comfy Cloud takes seconds. On
 * the user's own ComfyUI it starts on one of that server's checkpoints, with
 * sampler settings for the checkpoint's family.
 */
import {
  comfyPromptToGraph,
  type ComfyApiPrompt,
  type ComfyGraph
} from "@nodetool-ai/protocol";

const STARTER_PROMPT: ComfyApiPrompt = {
  "4": {
    class_type: "CheckpointLoaderSimple",
    inputs: { ckpt_name: "flux1-schnell-fp8.safetensors" }
  },
  "6": {
    class_type: "CLIPTextEncode",
    inputs: {
      text: "A cinematic still of a lighthouse on a cliff at dusk, volumetric fog, 35mm film",
      clip: ["4", 1]
    },
    _meta: { title: "Prompt" }
  },
  "7": {
    class_type: "CLIPTextEncode",
    inputs: { text: "", clip: ["4", 1] },
    _meta: { title: "Negative prompt" }
  },
  "5": {
    class_type: "EmptyLatentImage",
    inputs: { width: 1024, height: 576, batch_size: 1 }
  },
  "3": {
    class_type: "KSampler",
    inputs: {
      seed: 42,
      steps: 4,
      cfg: 1,
      sampler_name: "euler",
      scheduler: "simple",
      denoise: 1,
      model: ["4", 0],
      positive: ["6", 0],
      negative: ["7", 0],
      latent_image: ["5", 0]
    }
  },
  "8": {
    class_type: "VAEDecode",
    inputs: { samples: ["3", 0], vae: ["4", 2] }
  },
  "9": {
    class_type: "SaveImage",
    inputs: { filename_prefix: "nodetool", images: ["8", 0] }
  }
};

const OUTPUTS: Record<string, string[]> = {
  CheckpointLoaderSimple: ["MODEL", "CLIP", "VAE"],
  CLIPTextEncode: ["CONDITIONING"],
  EmptyLatentImage: ["LATENT"],
  KSampler: ["LATENT"],
  VAEDecode: ["IMAGE"],
  SaveImage: []
};

export interface ComfyStarterOptions {
  /** A checkpoint file on the target ComfyUI. Defaults to FLUX.1 schnell. */
  checkpoint?: string;
}

/**
 * The checkpoint a starter graph uses on a server: an SDXL file if there is
 * one, because those make a good 1024px picture at default settings, then the
 * first file in the folder.
 */
export const pickStarterCheckpoint = (
  checkpoints: readonly string[]
): string | undefined =>
  checkpoints.find((name) => /xl/i.test(name) && !/refiner/i.test(name)) ??
  checkpoints.find((name) => !/refiner/i.test(name)) ??
  checkpoints[0];

/** Steps and CFG for a checkpoint's family, judged from its file name. */
const samplerFor = (
  checkpoint: string
): { steps: number; cfg: number; scheduler: string } => {
  if (/schnell/i.test(checkpoint)) return { steps: 4, cfg: 1, scheduler: "simple" };
  if (/flux/i.test(checkpoint)) return { steps: 20, cfg: 1, scheduler: "simple" };
  return { steps: 25, cfg: 7, scheduler: "normal" };
};

/** A fresh seed per workflow, so a first run is never a cached result. */
export const comfyStarterGraph = (options: ComfyStarterOptions = {}): ComfyGraph => {
  const prompt: ComfyApiPrompt = structuredClone(STARTER_PROMPT);
  prompt["3"].inputs.seed = Math.floor(Math.random() * 2 ** 31);
  if (options.checkpoint) {
    prompt["4"].inputs.ckpt_name = options.checkpoint;
    Object.assign(prompt["3"].inputs, samplerFor(options.checkpoint));
  }
  return comfyPromptToGraph(prompt, (cls) => OUTPUTS[cls]);
};
