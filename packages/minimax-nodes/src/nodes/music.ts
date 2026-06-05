import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import {
  audioRefFromBytes,
  assertBaseResp,
  getMinimaxApiKey,
  MINIMAX_BASE_URL,
  MINIMAX_MUSIC_MODELS,
  minimaxHeaders,
  resolveAudioPayload
} from "../minimax-base.js";

const MUSIC_FORMATS = ["mp3", "wav"];

export class MinimaxMusicNode extends BaseNode {
  static readonly nodeType = "minimax.MusicGeneration";
  static readonly body = "content_card";
  static readonly title = "MiniMax Music Generation";
  static readonly description =
    "Generate a full song with vocals from a style description and lyrics " +
    "using MiniMax music models.\n" +
    "audio, music, song, generation, lyrics, vocals, minimax\n\n" +
    "Use cases:\n" +
    "- Turn lyrics into a finished song\n" +
    "- Prototype melodies and arrangements\n" +
    "- Create background music for videos\n" +
    "- Produce jingles and theme songs";
  static readonly metadataOutputTypes = { output: "audio" };
  static readonly inlineFields: string[] = ["prompt", "lyrics"];
  static readonly inputFields: string[] = ["prompt", "lyrics"];
  static readonly requiredSettings = ["MINIMAX_API_KEY"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "str",
    default: "An upbeat pop song with bright synths and a catchy chorus",
    title: "Prompt",
    description:
      "Describe the style, mood, genre, and instrumentation of the music."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default:
      "[Verse]\nWalking down the city street\n[Chorus]\nThis is our moment, shining bright",
    title: "Lyrics",
    description:
      "Song lyrics. Use newlines between lines and structure tags like " +
      "[Intro], [Verse], [Chorus], [Bridge], [Outro]."
  })
  declare lyrics: any;

  @prop({
    type: "enum",
    default: "music-1.5",
    title: "Model",
    description: "The MiniMax music model to use.",
    values: MINIMAX_MUSIC_MODELS
  })
  declare model: any;

  @prop({
    type: "enum",
    default: "mp3",
    title: "Format",
    description: "Output audio format.",
    values: MUSIC_FORMATS
  })
  declare format: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getMinimaxApiKey(this._secrets);

    const prompt = String(this.prompt ?? "");
    if (!prompt) throw new Error("Prompt is required");

    const lyrics = String(this.lyrics ?? "");
    if (!lyrics) throw new Error("Lyrics are required");

    const model = String(this.model ?? "music-1.5");
    const format = String(this.format ?? "mp3");

    const body: Record<string, unknown> = {
      model,
      prompt,
      lyrics,
      audio_setting: {
        sample_rate: 44100,
        bitrate: 256000,
        format
      },
      output_format: "hex"
    };

    const res = await fetch(`${MINIMAX_BASE_URL}/v1/music_generation`, {
      method: "POST",
      headers: minimaxHeaders(apiKey),
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      throw new Error(
        `MiniMax music_generation failed: ${res.status} ${await res.text()}`
      );
    }
    const data = (await res.json()) as Record<string, unknown>;
    assertBaseResp(data, "music_generation");

    const payload = data.data as Record<string, unknown> | undefined;
    const audio = payload?.audio as string | undefined;
    if (!audio) {
      throw new Error(
        `MiniMax music_generation returned no audio data: ${JSON.stringify(data)}`
      );
    }

    const bytes = await resolveAudioPayload(audio);
    return { output: audioRefFromBytes(bytes, format) };
  }
}

export const MUSIC_NODES: readonly NodeClass[] = [MinimaxMusicNode];
