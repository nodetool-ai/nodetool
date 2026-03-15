import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  getReplicateApiKey,
  replicateSubmit,
  removeNulls,
  isRefSet,
  assetToUrl,
  outputToImageRef,
  outputToVideoRef,
  outputToAudioRef,
  outputToString,
} from "../replicate-base.js";

const ReplicateNode = BaseNode;

export class AudioSuperResolution extends ReplicateNode {
  static readonly nodeType = "replicate.audio_enhance.AudioSuperResolution";
  static readonly title = "Audio Super Resolution";
  static readonly description = `AudioSR: Versatile Audio Super-resolution at Scale
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: "", description: "Random seed. Leave blank to randomize the seed" })
  declare seed: any;

  @prop({ type: "int", default: 50, description: "Number of inference steps" })
  declare ddim_steps: any;

  @prop({ type: "audio", default: "", description: "Audio to upsample" })
  declare input_file: any;

  @prop({ type: "float", default: 3.5, description: "Scale for classifier free guidance" })
  declare guidance_scale: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const seed = Number(inputs.seed ?? this.seed ?? "");
    const ddimSteps = Number(inputs.ddim_steps ?? this.ddim_steps ?? 50);
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 3.5);

    const args: Record<string, unknown> = {
      "seed": seed,
      "ddim_steps": ddimSteps,
      "guidance_scale": guidanceScale,
    };

    const inputFileRef = inputs.input_file as Record<string, unknown> | undefined;
    if (isRefSet(inputFileRef)) {
      const inputFileUrl = assetToUrl(inputFileRef!);
      if (inputFileUrl) args["input_file"] = inputFileUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "nateraw/audio-super-resolution", args);
    return { output: outputToAudioRef(res.output) };
  }
}

export const REPLICATE_AUDIO_ENHANCE_NODES: readonly NodeClass[] = [
  AudioSuperResolution,
] as const;