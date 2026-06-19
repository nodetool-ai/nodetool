import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import {
  cleanParams,
  getHfToken,
  hfPipelineBinary,
  videoRefFromBytes
} from "../huggingface-base.js";


// ---------------------------------------------------------------------------
// Text to Video
// ---------------------------------------------------------------------------
export class TextToVideoNode extends BaseNode {
  static readonly nodeType = "huggingface.TextToVideo";
  static readonly body = "content_card";
  static readonly title = "Text to Video";
  static readonly description =
    "Generate a video from a text prompt via Hugging Face Inference Providers.\n" +
    "video, text-to-video, t2v, generation, diffusion, huggingface\n\n" +
    "Use cases:\n" +
    "- Generate short clips from a description\n" +
    "- Prototype motion ideas\n" +
    "- Create animated content";
  static readonly inlineFields = ["prompt"];
  static readonly requiredSettings = ["HF_TOKEN"];
  static readonly autoSaveAsset = true;
  static readonly metadataOutputTypes = { output: "video" };

  @prop({
    type: "str",
    default: "Wan-AI/Wan2.2-T2V-A14B",
    title: "Model",
    description: "Text-to-video model repo id."
  })
  declare model: string;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The text prompt describing the video."
  })
  declare prompt: string;

  @prop({
    type: "str",
    default: "",
    title: "Negative Prompt",
    description: "What the video should NOT contain."
  })
  declare negative_prompt: string;

  @prop({
    type: "int",
    default: 0,
    title: "Num Frames",
    description: "Number of frames to generate (0 = model default).",
    min: 0,
    max: 300
  })
  declare num_frames: number;

  @prop({
    type: "float",
    default: 0,
    title: "Guidance Scale",
    description: "How closely to follow the prompt (0 = model default).",
    min: 0,
    max: 30
  })
  declare guidance_scale: number;

  @prop({
    type: "int",
    default: 0,
    title: "Inference Steps",
    description: "Number of denoising steps (0 = model default).",
    min: 0,
    max: 100
  })
  declare num_inference_steps: number;

  @prop({
    type: "int",
    default: -1,
    title: "Seed",
    description: "Random seed (-1 = random).",
    min: -1,
    max: 4294967295
  })
  declare seed: number;

  async process(): Promise<Record<string, unknown>> {
    const token = getHfToken(this._secrets);
    const prompt = String(this.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");

    const numFrames = Number(this.num_frames ?? 0);
    const guidance = Number(this.guidance_scale ?? 0);
    const steps = Number(this.num_inference_steps ?? 0);
    const seed = Number(this.seed ?? -1);

    const { bytes, mimeType } = await hfPipelineBinary(
      token,
      String(this.model ?? "Wan-AI/Wan2.2-T2V-A14B"),
      {
        inputs: prompt,
        parameters: cleanParams({
          negative_prompt: String(this.negative_prompt ?? "") || undefined,
          num_frames: numFrames > 0 ? numFrames : undefined,
          guidance_scale: guidance > 0 ? guidance : undefined,
          num_inference_steps: steps > 0 ? steps : undefined,
          seed: seed >= 0 ? seed : undefined
        })
      }
    );

    return {
      output: videoRefFromBytes(bytes, mimeType.startsWith("video/") ? mimeType : "video/mp4")
    };
  }
}

export const HUGGINGFACE_VIDEO_NODES: readonly NodeClass[] = [TextToVideoNode];
