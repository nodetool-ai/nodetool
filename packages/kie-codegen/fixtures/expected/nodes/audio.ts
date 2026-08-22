import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import {
  getApiKey,
  kieExecuteTask,
  isRefSet,
  uploadAudioInput,
} from "../kie-base.js";

export class ElevenlabsAudioIsolationNode extends BaseNode {
  static readonly nodeType = "kie.audio.ElevenlabsAudioIsolation";
  static readonly title = "elevenlabs/audio-isolation";
  static readonly description = `elevenlabs/audio-isolation via Kie.ai.

    kie, audio, ai

    Content generation using elevenlabs/audio-isolation`;
  static readonly metadataOutputTypes = { output: "audio" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly inlineFields = [];
  static readonly inputFields = ["audio"];

  @prop({ type: "audio", default: {"type":"audio","uri":"","asset_id":null,"data":null,"metadata":null}, title: "Audio", description: "URL of the audio file to isolate voice from (File URL after upload, not file content; Accepted types: audio/mpeg, audio/wav, audio/x-wav, audio/aac, audio/mp4, audio/ogg; Max size: 10.0MB)" })
  declare audio: any;

  async process(context?: Parameters<BaseNode["process"]>[0]): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    let audioUrl = "";
    if (isRefSet(this.audio)) audioUrl = await uploadAudioInput(apiKey, this.audio, context);
    const params: Record<string, unknown> = {};
    if (audioUrl) params["audio_url"] = audioUrl;

    const result = await kieExecuteTask(apiKey, "elevenlabs/audio-isolation", params, 4000, 120);
    return { output: { type: "audio", data: result.data } };
  }
}

export const KIE_AUDIO_NODES: readonly NodeClass[] = [
  ElevenlabsAudioIsolationNode,
] as const;
