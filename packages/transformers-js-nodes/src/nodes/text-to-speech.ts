import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  DEVICE_VALUES,
  DTYPE_VALUES,
  asString,
  getPipeline,
  normalizeOption
} from "../transformers-base.js";

type TtsResult = {
  audio?: Float32Array | ArrayLike<number>;
  sampling_rate?: number;
};

/** Encode mono Float32 audio (range -1..1) as a 16-bit PCM WAV buffer. */
function floatsToWav(samples: ArrayLike<number>, samplingRate: number): Buffer {
  const numSamples = samples.length;
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(samplingRate, 24);
  buffer.writeUInt32LE(samplingRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    let s = samples[i];
    if (!Number.isFinite(s)) s = 0;
    if (s > 1) s = 1;
    if (s < -1) s = -1;
    const pcm = s < 0 ? s * 0x8000 : s * 0x7fff;
    buffer.writeInt16LE(pcm | 0, offset);
    offset += 2;
  }
  return buffer;
}

export class TextToSpeechNode extends BaseNode {
  static readonly nodeType = "transformers.TextToSpeech";
  static readonly title = "Text to Speech";
  static readonly description =
    "Synthesize speech from text using a Transformers.js text-to-speech pipeline.\n" +
    "audio, tts, speech, transformers, huggingface\n\n" +
    "Use cases:\n" +
    "- Add voice output to local agents\n" +
    "- Generate narration without an external API\n" +
    "- Build accessible interfaces";
  static readonly metadataOutputTypes = { output: "audio" };
  static readonly autoSaveAsset = true;

  @prop({
    type: "str",
    default: "Hello, this is a test of text to speech.",
    title: "Text",
    description: "Text to synthesize."
  })
  declare text: any;

  @prop({
    type: "str",
    default: "Xenova/speecht5_tts",
    title: "Model",
    description: "Hugging Face model id (must be transformers.js-compatible)."
  })
  declare model: any;

  @prop({
    type: "str",
    default:
      "https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin",
    title: "Speaker Embedding URL",
    description:
      "Optional speaker embedding URL (required by SpeechT5; ignored by other models)."
  })
  declare speaker_embeddings: any;

  @prop({
    type: "enum",
    default: "auto",
    title: "Quantization",
    description: "Model dtype / quantization level.",
    values: DTYPE_VALUES
  })
  declare dtype: any;

  @prop({
    type: "enum",
    default: "auto",
    title: "Device",
    description: "Inference device.",
    values: DEVICE_VALUES
  })
  declare device: any;

  async process(): Promise<Record<string, unknown>> {
    const text = asString(this.text);
    if (!text) throw new Error("Text is required");

    const pipeline = (await getPipeline({
      task: "text-to-speech",
      model: asString(this.model) || undefined,
      dtype: normalizeOption(this.dtype),
      device: normalizeOption(this.device)
    })) as (
      input: string,
      opts?: Record<string, unknown>
    ) => Promise<TtsResult>;

    const opts: Record<string, unknown> = {};
    const speakerEmbeddings = asString(this.speaker_embeddings);
    if (speakerEmbeddings) opts.speaker_embeddings = speakerEmbeddings;

    const result = await pipeline(text, opts);
    const samples = result?.audio;
    if (!samples) {
      throw new Error("Text-to-speech pipeline returned no audio data");
    }
    const samplingRate = result.sampling_rate ?? 16000;
    const wav = floatsToWav(samples, samplingRate);
    const base64 = wav.toString("base64");

    return {
      output: {
        type: "audio",
        data: `data:audio/wav;base64,${base64}`,
        mimeType: "audio/wav"
      }
    };
  }
}

export const TEXT_TO_SPEECH_NODES: readonly NodeClass[] = [TextToSpeechNode];
