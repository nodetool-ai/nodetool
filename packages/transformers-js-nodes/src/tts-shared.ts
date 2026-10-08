import { importOptionalModule } from "@nodetool-ai/config";
import { loadTransformers, resolveDevice } from "./transformers-base.js";
import { ModelCache } from "./model-cache.js";
import type { KokoroTTS } from "kokoro-js";

/** Voices supported by kokoro-js v1.2.1 (English only). */
export const KOKORO_VOICES = [
  // American English — female
  "af_heart", "af_alloy", "af_aoede", "af_bella", "af_jessica",
  "af_kore", "af_nicole", "af_nova", "af_river", "af_sarah", "af_sky",
  // American English — male
  "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam",
  "am_michael", "am_onyx", "am_puck", "am_santa",
  // British English — female
  "bf_alice", "bf_emma", "bf_isabella", "bf_lily",
  // British English — male
  "bm_daniel", "bm_fable", "bm_george", "bm_lewis"
] as const;

export type KokoroVoice = (typeof KOKORO_VOICES)[number];

export function isKokoroRepo(repoId: string | undefined): boolean {
  return !!repoId && /kokoro/i.test(repoId);
}

export function isSpeechT5Repo(repoId: string | undefined): boolean {
  return !!repoId && /speecht5/i.test(repoId);
}

/** Loaded Kokoro models kept resident; idle extras are evicted and disposed. */
const MAX_CACHED_KOKORO = 2;

const kokoroCache = new ModelCache<KokoroTTS>(
  MAX_CACHED_KOKORO,
  (tts) => (tts as { model?: { dispose?: () => unknown } }).model?.dispose?.(),
  ["generate"]
);

/**
 * Load (or reuse) a KokoroTTS instance for the given repo. The cache key
 * includes dtype/device so concurrent variants don't collide. We always
 * `await loadTransformers()` first so kokoro-js inherits our cache directory
 * and remote-models config from the shared `@huggingface/transformers` env.
 */
export async function getKokoro(
  repoId: string,
  dtype: string | undefined,
  requestedDevice: string | undefined
): Promise<KokoroTTS> {
  const device = resolveDevice(requestedDevice);
  const key = `${repoId}|${dtype ?? ""}|${device ?? ""}`;
  return kokoroCache.get(key, async () => {
    await loadTransformers();
    let KokoroTTS: typeof import("kokoro-js").KokoroTTS;
    try {
      ({ KokoroTTS } = await importOptionalModule<typeof import("kokoro-js")>(
        "kokoro-js"
      ));
    } catch (err) {
      throw new Error(
        "The 'kokoro-js' package is required for Kokoro text-to-speech. " +
          "Install the \"Transformers.js\" runtime package from the Package " +
          "Manager (it bundles kokoro-js and onnxruntime). " +
          `Original error: ${(err as Error)?.message ?? err}`
      );
    }
    const opts: Record<string, unknown> = {};
    if (dtype) opts.dtype = dtype;
    if (device) opts.device = device;
    return KokoroTTS.from_pretrained(repoId, opts as never);
  });
}

/**
 * Kokoro truncates its phoneme tokens to the model's context length (about
 * 510 tokens), so long input loses its tail without an error. This many
 * characters of English stays well under that limit.
 */
const KOKORO_MAX_CHUNK_CHARS = 300;

/**
 * Split text into chunks of at most `maxChars`, breaking between sentences
 * where possible and between words otherwise. A single word longer than
 * `maxChars` stays whole.
 */
export function splitTextForTts(
  text: string,
  maxChars: number = KOKORO_MAX_CHUNK_CHARS
): string[] {
  const pieces: string[] = [];
  for (const sentence of text.split(/(?<=[.!?;:…])\s+|\n+/)) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    if (trimmed.length <= maxChars) {
      pieces.push(trimmed);
      continue;
    }
    let current = "";
    for (const word of trimmed.split(/\s+/)) {
      if (current && current.length + 1 + word.length > maxChars) {
        pieces.push(current);
        current = word;
      } else {
        current = current ? `${current} ${word}` : word;
      }
    }
    if (current) pieces.push(current);
  }

  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (current && current.length + 1 + piece.length > maxChars) {
      chunks.push(current);
      current = piece;
    } else {
      current = current ? `${current} ${piece}` : piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** The part of `KokoroTTS` that `generateKokoroSpeech` calls. */
interface KokoroGenerator {
  generate(
    text: string,
    options: { voice?: KokoroVoice; speed?: number }
  ): Promise<{ audio: Float32Array; sampling_rate: number }>;
}

/**
 * Synthesize `text` with Kokoro one sentence chunk at a time and concatenate
 * the audio, so text longer than the model's context is spoken in full.
 */
export async function generateKokoroSpeech(
  tts: KokoroGenerator,
  text: string,
  options: { voice?: KokoroVoice; speed?: number }
): Promise<{ audio: Float32Array; sampling_rate: number }> {
  const chunks = splitTextForTts(text);
  if (chunks.length === 0) {
    throw new Error("Text is required");
  }
  const parts: Float32Array[] = [];
  let samplingRate = 24000;
  for (const chunk of chunks) {
    const result = await tts.generate(chunk, options);
    parts.push(result.audio);
    samplingRate = result.sampling_rate ?? samplingRate;
  }
  if (parts.length === 1) {
    return { audio: parts[0], sampling_rate: samplingRate };
  }
  const audio = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    audio.set(part, offset);
    offset += part.length;
  }
  return { audio, sampling_rate: samplingRate };
}

/** Reset the Kokoro instance cache. Intended for tests. */
export function clearKokoroCache(): void {
  kokoroCache.clear();
}
