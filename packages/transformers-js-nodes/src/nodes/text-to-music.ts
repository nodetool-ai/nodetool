import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  asString,
  extractRepoId,
  tjsModelDefault
} from "../transformers-base.js";
import type { HfModelRef } from "../transformers-base.js";
import { defaultRepoFor } from "../recommended-models.js";
import { encodeWav } from "../wav.js";
import {
  MUSICGEN_DEFAULT_GUIDANCE,
  MUSICGEN_DEFAULT_SECONDS,
  MUSICGEN_MAX_SECONDS,
  generateMusic,
  getMusicgen
} from "../music-shared.js";

const TJS_TYPE = "tjs.text_to_music";

/** Output handles TextToMusicNode.process() emits. */
type TextToMusicNodeOutputs = {
  output: { type: string; data: string; content_type: string };
};

export class TextToMusicNode extends BaseNode {
  static readonly nodeType = "transformers.TextToMusic";
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["prompt"];
  static readonly body = "content_card";
  static readonly title = "Text to Music";
  static readonly description =
    "Generate music from a text description with MusicGen, on this computer.\n" +
    "audio, music, musicgen, transformers, huggingface\n\n" +
    "Use cases:\n" +
    "- Make background music without an external API\n" +
    "- Sketch a jingle or a loop from a style description\n" +
    "- Score a video draft offline";
  static readonly metadataOutputTypes = { output: "audio" };
  static readonly autoSaveAsset = true;

  @prop({
    type: "str",
    default: "Upbeat lo-fi hip hop with a warm piano and soft drums",
    title: "Prompt",
    description: "Genre, mood, instruments and tempo of the music."
  })
  declare prompt: string;

  @prop({
    type: TJS_TYPE,
    default: tjsModelDefault(TJS_TYPE, defaultRepoFor(TJS_TYPE)),
    title: "Model",
    description: "MusicGen model (ONNX-compatible)."
  })
  declare model: HfModelRef;

  @prop({
    type: "float",
    default: MUSICGEN_DEFAULT_SECONDS,
    title: "Duration",
    description: "Length of the music in seconds.",
    min: 1,
    max: MUSICGEN_MAX_SECONDS
  })
  declare duration: number;

  @prop({
    type: "float",
    default: MUSICGEN_DEFAULT_GUIDANCE,
    title: "Guidance Scale",
    description:
      "How closely the music follows the prompt. Higher values follow it more closely and vary less.",
    min: 1,
    max: 10
  })
  declare guidance_scale: number;

  async process(context?: ProcessingContext): Promise<TextToMusicNodeOutputs> {
    const prompt = asString(this.prompt);
    if (!prompt) throw new Error("Prompt is required");
    const repoId = extractRepoId(this.model) || defaultRepoFor(TJS_TYPE);

    const musicgen = await getMusicgen(repoId, undefined, undefined);
    const result = await generateMusic(musicgen, prompt, {
      durationSeconds: this.duration,
      guidanceScale: this.guidance_scale,
      signal: context?.signal
    });
    const wav = encodeWav(result.audio, result.sampling_rate);

    return {
      output: {
        type: "audio",
        data: wav.toString("base64"),
        content_type: "audio/wav"
      }
    };
  }
}

export const TEXT_TO_MUSIC_NODES: readonly NodeClass[] = [TextToMusicNode];
