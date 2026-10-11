/**
 * Audio preparation and response decoding for Meta's Muse Voice Transcribe
 * model (`POST /v1/asr/transcribe`).
 *
 * The endpoint takes only RIFF/WAVE, mono, 16-bit integer PCM at 16 or 24 kHz.
 * Audio already in that shape is sent as is; anything else is transcoded with
 * ffmpeg first, the conversion Meta's docs give
 * (`-ac 1 -ar 24000 -c:a pcm_s16le -map_metadata -1`).
 * See https://dev.meta.ai/docs/speech-to-text.
 *
 * The ffmpeg argv is ours and its only input is a temp file this module
 * wrote, as in `video-frames.ts`. `-protocol_whitelist file` and `-nostdin`
 * still go in.
 */
import { importNodeBuiltin } from "@nodetool-ai/config";
import { isNumber, isRecord, isString } from "@nodetool-ai/protocol";
import type { ASRResult, AudioChunk } from "./types.js";

const TRANSCRIBE_SAMPLE_RATES = new Set([16000, 24000]);
const FFMPEG_MAX_BUFFER = 8 * 1024 * 1024;

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

/**
 * Whether `bytes` is a WAV file the transcribe endpoint accepts unchanged.
 * Walks the RIFF chunks by their declared sizes (word-aligned) to find `fmt `,
 * and answers false for anything it cannot read, which sends the audio
 * through ffmpeg rather than to a 400.
 */
export function isTranscribeReadyWav(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") {
    return false;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = ascii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt ") {
      if (size < 16 || offset + 8 + 16 > bytes.length) return false;
      const body = offset + 8;
      const audioFormat = view.getUint16(body, true);
      const channels = view.getUint16(body + 2, true);
      const sampleRate = view.getUint32(body + 4, true);
      const bitsPerSample = view.getUint16(body + 14, true);
      return (
        audioFormat === 1 &&
        channels === 1 &&
        bitsPerSample === 16 &&
        TRANSCRIBE_SAMPLE_RATES.has(sampleRate)
      );
    }
    offset += 8 + size + (size & 1);
  }
  return false;
}

/** ffmpeg is not installed. Names what needed it and the way out. */
export class TranscribeAudioConversionUnavailableError extends Error {
  constructor() {
    super(
      "ffmpeg is not installed or not on PATH. Meta's transcription endpoint " +
        "only reads mono 16-bit WAV at 16 or 24 kHz, and other audio is " +
        "converted with ffmpeg first. Install ffmpeg (the Package Manager UI " +
        "can do this), or pass audio that is already in that format."
    );
    this.name = "TranscribeAudioConversionUnavailableError";
  }
}

/** Convert any audio ffmpeg can read to mono 16-bit PCM WAV at 24 kHz. */
async function transcodeToTranscribeWav(
  bytes: Uint8Array,
  signal?: AbortSignal
): Promise<Uint8Array> {
  const [cp, fs, os, path] = await Promise.all([
    importNodeBuiltin<typeof import("node:child_process")>(
      "node:child_process"
    ),
    importNodeBuiltin<typeof import("node:fs/promises")>("node:fs/promises"),
    importNodeBuiltin<typeof import("node:os")>("node:os"),
    importNodeBuiltin<typeof import("node:path")>("node:path")
  ]);
  if (!cp || !fs || !os || !path) {
    throw new Error("Audio conversion requires Node built-in modules");
  }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-meta-asr-"));
  const input = path.join(dir, "input.bin");
  const output = path.join(dir, "output.wav");
  try {
    await fs.writeFile(input, bytes);
    await new Promise<void>((resolve, reject) => {
      cp.execFile(
        "ffmpeg",
        [
          "-nostdin",
          "-y",
          "-v",
          "error",
          "-protocol_whitelist",
          "file",
          "-i",
          input,
          "-ac",
          "1",
          "-ar",
          "24000",
          "-c:a",
          "pcm_s16le",
          "-map_metadata",
          "-1",
          output
        ],
        { maxBuffer: FFMPEG_MAX_BUFFER, signal, windowsHide: true },
        (error) => {
          if ((error as { code?: unknown } | null)?.code === "ENOENT") {
            reject(new TranscribeAudioConversionUnavailableError());
            return;
          }
          if (error) {
            reject(error);
            return;
          }
          resolve();
        }
      );
    });
    return new Uint8Array(await fs.readFile(output));
  } finally {
    // Cleanup failure must not replace the conversion result or its error.
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** `bytes` in the one WAV shape the transcribe endpoint accepts. */
export async function toTranscribeWav(
  bytes: Uint8Array,
  signal?: AbortSignal
): Promise<Uint8Array> {
  if (isTranscribeReadyWav(bytes)) return bytes;
  return transcodeToTranscribeWav(bytes, signal);
}

/**
 * Meta's `languageBias` takes English language names ("English", "French"),
 * while NodeTool's ASR callers pass ISO 639 codes ("en", "fr-CA"). A value
 * that is already a name, or a code Intl cannot name, passes through.
 */
export function languageBiasName(language: string): string {
  const trimmed = language.trim();
  const primary = trimmed.split(/[-_]/)[0];
  if (!/^[a-z]{2,3}$/i.test(primary)) return trimmed;
  try {
    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(
      primary.toLowerCase()
    );
    return name && name.toLowerCase() !== primary.toLowerCase()
      ? name
      : trimmed;
  } catch {
    // An invalid tag throws a RangeError; send what the caller gave.
    return trimmed;
  }
}

/** Recognition-bias terms from a free-text prompt: comma or line separated. */
export function keywordsFromPrompt(prompt: string): string[] {
  return prompt
    .split(/[,\n]/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

/**
 * Decode the transcribe endpoint's JSON answer. `turns` carry millisecond
 * timings in ENDPOINTING and DIARIZATION modes and become chunks in seconds.
 */
export function decodeTranscribeResponse(payload: unknown): {
  result: ASRResult;
  audioDurationMs: number | null;
} {
  if (!isRecord(payload) || !isString(payload.transcript)) {
    throw new Error("Meta transcription response has no transcript");
  }
  const chunks: AudioChunk[] = [];
  if (Array.isArray(payload.turns)) {
    for (const turn of payload.turns) {
      if (
        !isRecord(turn) ||
        !isNumber(turn.startMs) ||
        !isNumber(turn.endMs) ||
        !isString(turn.transcript)
      ) {
        continue;
      }
      chunks.push({
        timestamp: [turn.startMs / 1000, turn.endMs / 1000],
        text: turn.transcript
      });
    }
  }
  const result: ASRResult = { text: payload.transcript };
  if (chunks.length > 0) result.chunks = chunks;
  return {
    result,
    audioDurationMs: isNumber(payload.audioDurationMs)
      ? payload.audioDurationMs
      : null
  };
}
