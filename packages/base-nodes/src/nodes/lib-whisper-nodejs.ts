/**
 * Local speech-to-text nodes backed by the `nodejs-whisper` package
 * (whisper.cpp bindings). The first invocation for a given model will
 * compile whisper.cpp and download the GGML model file under the package's
 * `cpp/whisper.cpp` directory; later runs reuse the cached binary/model.
 *
 * Requires `make` and a C/C++ toolchain on the host machine.
 */
import { BaseNode, prop } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { audioBytesAsync } from "../lib/audio-wav.js";

const WHISPER_MODELS = [
  "tiny",
  "tiny.en",
  "base",
  "base.en",
  "small",
  "small.en",
  "medium",
  "medium.en",
  "large-v1",
  "large",
  "large-v3-turbo"
];

type AudioChunk = { timestamp: [number, number]; text: string };

function pickExtension(bytes: Uint8Array): string {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46
  ) {
    return ".wav";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x4f &&
    bytes[1] === 0x67 &&
    bytes[2] === 0x67 &&
    bytes[3] === 0x53
  ) {
    return ".ogg";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x66 &&
    bytes[1] === 0x4c &&
    bytes[2] === 0x61 &&
    bytes[3] === 0x43
  ) {
    return ".flac";
  }
  return ".mp3";
}

function offsetToSeconds(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value / 1000 : 0;
}

function parseWhisperJson(raw: string): {
  text: string;
  segments: AudioChunk[];
  words: AudioChunk[];
} {
  const segments: AudioChunk[] = [];
  const words: AudioChunk[] = [];
  let text = "";
  const data = JSON.parse(raw) as Record<string, unknown>;
  const transcription = data.transcription as
    | Array<Record<string, unknown>>
    | undefined;
  if (!transcription) return { text, segments, words };

  const textParts: string[] = [];
  for (const seg of transcription) {
    const segText = String(seg.text ?? "").trim();
    textParts.push(segText);
    const offsets = (seg.offsets ?? {}) as Record<string, unknown>;
    segments.push({
      timestamp: [offsetToSeconds(offsets.from), offsetToSeconds(offsets.to)],
      text: segText
    });
    const tokens = seg.tokens as Array<Record<string, unknown>> | undefined;
    if (!tokens) continue;
    for (const tok of tokens) {
      const tokText = String(tok.text ?? "");
      if (!tokText.trim() || tokText.startsWith("[_")) continue;
      const tokOffsets = (tok.offsets ?? {}) as Record<string, unknown>;
      words.push({
        timestamp: [
          offsetToSeconds(tokOffsets.from),
          offsetToSeconds(tokOffsets.to)
        ],
        text: tokText
      });
    }
  }
  text = textParts.join(" ").trim();
  return { text, segments, words };
}

async function readJsonOutput(
  inputPath: string
): Promise<{ text: string; segments: AudioChunk[]; words: AudioChunk[] } | null> {
  const candidates = [
    `${inputPath}.json`,
    inputPath.replace(/\.[^./\\]+$/, "") + ".wav.json",
    inputPath.replace(/\.[^./\\]+$/, "") + ".json"
  ];
  for (const candidate of candidates) {
    try {
      const raw = await fs.readFile(candidate, "utf-8");
      return parseWhisperJson(raw);
    } catch {
      // try next candidate
    }
  }
  return null;
}

export class WhisperTranscribeLibNode extends BaseNode {
  static readonly nodeType = "lib.whisper.Transcribe";
  static readonly title = "Whisper Transcribe (Local)";
  static readonly description =
    "Transcribe audio to text locally using whisper.cpp via the nodejs-whisper package.\n    audio, transcription, speech-to-text, stt, whisper, local, offline";
  static readonly metadataOutputTypes = {
    text: "str",
    segments: "list[audio_chunk]",
    words: "list[audio_chunk]"
  };
  static readonly basicFields = ["audio", "model", "language", "timestamps"];
  static readonly exposeAsTool = true;

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "The audio to transcribe."
  })
  declare audio: any;

  @prop({
    type: "enum",
    default: "base.en",
    title: "Model",
    description:
      "Whisper GGML model. Models ending in '.en' are English-only and faster. The model is downloaded automatically on first run.",
    values: WHISPER_MODELS
  })
  declare model: any;

  @prop({
    type: "str",
    default: "auto",
    title: "Language",
    description:
      "Language code (e.g. 'en', 'fr', 'de'). Use 'auto' to auto-detect."
  })
  declare language: any;

  @prop({
    type: "bool",
    default: false,
    title: "Translate To English",
    description: "Translate non-English speech directly to English text."
  })
  declare translate: any;

  @prop({
    type: "bool",
    default: false,
    title: "Timestamps",
    description: "Return per-segment and per-word timestamps."
  })
  declare timestamps: any;

  @prop({
    type: "bool",
    default: false,
    title: "Use CUDA",
    description:
      "Build whisper.cpp with CUDA support. Requires an NVIDIA GPU and the CUDA toolkit on the host."
  })
  declare withCuda: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const audio = (this.audio ?? {}) as Record<string, unknown>;
    if (!audio || (!audio.data && !audio.uri)) {
      throw new Error("Audio input is required");
    }
    const bytes = await audioBytesAsync(audio, context);
    if (bytes.length === 0) {
      throw new Error("Audio input is required");
    }

    const model = String(this.model ?? "base.en") || "base.en";
    if (!WHISPER_MODELS.includes(model)) {
      throw new Error(
        `Invalid Whisper model: ${model}. Expected one of: ${WHISPER_MODELS.join(", ")}`
      );
    }
    const language = String(this.language ?? "auto") || "auto";
    const translate = Boolean(this.translate ?? false);
    const wantTimestamps = Boolean(this.timestamps ?? false);
    const withCuda = Boolean(this.withCuda ?? false);

    const tmpDir = await fs.mkdtemp(path.join(tmpdir(), "nodetool-whisper-"));
    const inputPath = path.join(tmpDir, `input${pickExtension(bytes)}`);
    await fs.writeFile(inputPath, bytes);

    try {
      const mod = (await import("nodejs-whisper")) as Record<string, unknown>;
      const nodewhisper =
        (mod.nodewhisper as
          | ((p: string, o: Record<string, unknown>) => Promise<string>)
          | undefined) ??
        ((mod.default as Record<string, unknown> | undefined)
          ?.nodewhisper as
          | ((p: string, o: Record<string, unknown>) => Promise<string>)
          | undefined);
      if (typeof nodewhisper !== "function") {
        throw new Error("nodejs-whisper nodewhisper() is not available");
      }

      const whisperOptions: Record<string, unknown> = {
        outputInText: false,
        outputInSrt: false,
        outputInVtt: false,
        outputInCsv: false,
        outputInLrc: false,
        outputInWords: false,
        outputInJson: false,
        outputInJsonFull: wantTimestamps,
        translateToEnglish: translate,
        wordTimestamps: wantTimestamps,
        splitOnWord: false,
        timestamps_length: 20,
        noGpu: !withCuda
      };
      if (language !== "auto") {
        whisperOptions.language = language;
      }

      const transcript = await nodewhisper(inputPath, {
        modelName: model,
        autoDownloadModelName: model,
        removeWavFileAfterTranscription: false,
        withCuda,
        whisperOptions
      });

      let text = String(transcript ?? "").trim();
      let segments: AudioChunk[] = [];
      let words: AudioChunk[] = [];

      if (wantTimestamps) {
        const parsed = await readJsonOutput(inputPath);
        if (parsed) {
          if (parsed.text) text = parsed.text;
          segments = parsed.segments;
          words = parsed.words;
        }
      }

      return { text, segments, words };
    } finally {
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    }
  }
}

export const LIB_WHISPER_NODES = [WhisperTranscribeLibNode] as const;
