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
  outputToString
} from "../replicate-base.js";

const ReplicateNode = BaseNode;

export class AudioSuperResolution extends ReplicateNode {
  static readonly nodeType = "replicate.audio.enhance.AudioSuperResolution";
  static readonly title = "Audio Super Resolution";
  static readonly description = `AudioSR: Versatile Audio Super-resolution at Scale
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({ type: "int", default: 50, description: "Number of inference steps" })
  declare ddim_steps: any;

  @prop({
    type: "float",
    default: 3.5,
    description: "Scale for classifier free guidance"
  })
  declare guidance_scale: any;

  @prop({ type: "audio", default: "", description: "Audio to upsample" })
  declare input_file: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank to randomize the seed"
  })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const ddimSteps = Number(this.ddim_steps ?? 50);
    const guidanceScale = Number(this.guidance_scale ?? 3.5);
    const seed = Number(this.seed ?? -1);

    const args: Record<string, unknown> = {
      ddim_steps: ddimSteps,
      guidance_scale: guidanceScale,
      seed: seed
    };

    const inputFileRef = this.input_file as Record<string, unknown> | undefined;
    if (isRefSet(inputFileRef)) {
      const inputFileUrl = await assetToUrl(inputFileRef!, apiKey);
      if (inputFileUrl) args["input_file"] = inputFileUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "nateraw/audio-super-resolution:0e453d5e4c2e0ef4f8d38a6167053dda09cf3c8dbca2355cde61dca55a915bc5",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export const REPLICATE_AUDIO_ENHANCE_NODES: readonly NodeClass[] = [
  AudioSuperResolution
] as const;
