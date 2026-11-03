/**
 * The graph a new Comfy workflow starts from: ComfyUI's default text-to-image
 * graph, on FLUX.1 schnell so the first run on Comfy Cloud takes seconds.
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

/** A fresh seed per workflow, so a first run is never a cached result. */
export const comfyStarterGraph = (): ComfyGraph => {
  const prompt: ComfyApiPrompt = structuredClone(STARTER_PROMPT);
  prompt["3"].inputs.seed = Math.floor(Math.random() * 2 ** 31);
  return comfyPromptToGraph(prompt, (cls) => OUTPUTS[cls]);
};
