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

export class Demucs extends ReplicateNode {
  static readonly nodeType = "replicate.audio.separate.Demucs";
  static readonly title = "Demucs";
  static readonly description = `Demucs is an audio source separator created by Facebook Research.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "audio",
    default: "",
    description: "Upload the file to be processed here."
  })
  declare audio: any;

  @prop({
    type: "enum",
    default: "rescale",
    values: ["rescale", "clamp", "none"],
    description:
      "Choose the strategy for avoiding clipping. Rescale will rescale entire signal if necessary or clamp will allow hard clipping."
  })
  declare clip_mode: any;

  @prop({
    type: "int",
    default: 0,
    description: "Choose the number of parallel jobs to use for separation."
  })
  declare jobs: any;

  @prop({
    type: "enum",
    default: "htdemucs",
    values: [
      "htdemucs",
      "htdemucs_ft",
      "htdemucs_6s",
      "hdemucs_mmi",
      "mdx_q",
      "mdx_extra_q"
    ],
    description:
      "Choose the demucs audio that proccesses your audio. The readme has more information on what to choose."
  })
  declare model: any;

  @prop({
    type: "int",
    default: 320,
    description:
      "Choose the bitrate for the MP3 output. Higher is better quality but larger file size. If MP3 is not selected as the output type, this has no effect."
  })
  declare mp3_bitrate: any;

  @prop({
    type: "enum",
    default: 2,
    values: ["2", "3", "4", "5", "6", "7"],
    description:
      "Choose the preset for the MP3 output. Higher is faster but worse quality. If MP3 is not selected as the output type, this has no effect."
  })
  declare mp3_preset: any;

  @prop({
    type: "enum",
    default: "mp3",
    values: ["mp3", "flac", "wav"],
    description:
      "Choose the audio format you would like the result to be returned in."
  })
  declare output_format: any;

  @prop({
    type: "float",
    default: 0.25,
    description: "Choose the amount of overlap between prediction windows."
  })
  declare overlap: any;

  @prop({
    type: "int",
    default: 0,
    description: "Choose the segment length to use for separation."
  })
  declare segment: any;

  @prop({
    type: "int",
    default: 1,
    description:
      "Choose the amount random shifts for equivariant stabilization. This performs multiple predictions with random shifts of the input and averages them, which makes it x times slower."
  })
  declare shifts: any;

  @prop({
    type: "bool",
    default: true,
    description: "Choose whether or not the audio should be split into chunks."
  })
  declare split: any;

  @prop({
    type: "enum",
    default: "none",
    values: ["none", "drums", "bass", "other", "vocals", "guitar", "piano"],
    description: "If you just want to isolate one stem, you can choose it here."
  })
  declare stem: any;

  @prop({
    type: "enum",
    default: "int24",
    values: ["int16", "int24", "float32"],
    description:
      "Choose format for the WAV output. If WAV is not selected as the output type, this has no effect."
  })
  declare wav_format: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const clipMode = String(this.clip_mode ?? "rescale");
    const jobs = Number(this.jobs ?? 0);
    const model = String(this.model ?? "htdemucs");
    const mp3Bitrate = Number(this.mp3_bitrate ?? 320);
    const mp3Preset = String(this.mp3_preset ?? 2);
    const outputFormat = String(this.output_format ?? "mp3");
    const overlap = Number(this.overlap ?? 0.25);
    const segment = Number(this.segment ?? 0);
    const shifts = Number(this.shifts ?? 1);
    const split = Boolean(this.split ?? true);
    const stem = String(this.stem ?? "none");
    const wavFormat = String(this.wav_format ?? "int24");

    const args: Record<string, unknown> = {
      clip_mode: clipMode,
      jobs: jobs,
      model: model,
      mp3_bitrate: mp3Bitrate,
      mp3_preset: mp3Preset,
      output_format: outputFormat,
      overlap: overlap,
      segment: segment,
      shifts: shifts,
      split: split,
      stem: stem,
      wav_format: wavFormat
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToUrl(audioRef!, apiKey);
      if (audioUrl) args["audio"] = audioUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "ryan5453/demucs:5a7041cc9b82e5a558fea6b3d7b12dea89625e89da33f0447bd727c2d0ab9e77",
      args
    );
    return { output: outputToAudioRef(res.output) };
  }
}

export const REPLICATE_AUDIO_SEPARATE_NODES: readonly NodeClass[] = [
  Demucs
] as const;
