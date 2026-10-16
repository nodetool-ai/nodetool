/**
 * MusicGen text-to-music, shared by the `transformers.TextToMusic` node and
 * the provider's `textToMusic`.
 *
 * Transformers.js has no text-to-music pipeline: its `text-to-audio` pipeline
 * runs one forward pass, and MusicGen needs `generate()` to sample audio
 * codes. So the model loads as `MusicgenForConditionalGeneration` with its
 * tokenizer, the way Kokoro loads through kokoro-js.
 */

import { loadTransformers, resolveDevice } from "./transformers-base.js";
import { ModelCache } from "./model-cache.js";
import { trackModelLoad } from "./model-load-progress.js";

export function isMusicgenRepo(repoId: string | undefined): boolean {
  return !!repoId && /musicgen/i.test(repoId);
}

/** MusicGen was trained on clips of up to 30 seconds. */
export const MUSICGEN_MAX_SECONDS = 30;

export const MUSICGEN_DEFAULT_SECONDS = 10;

/** The classifier-free guidance scale the MusicGen authors use. */
export const MUSICGEN_DEFAULT_GUIDANCE = 3;

/** A Transformers.js tensor, as far as this file reads it. */
interface AudioTensor {
  data: Float32Array;
}

interface MusicgenConfig {
  audio_encoder: { sampling_rate: number; frame_rate: number };
  decoder: { num_codebooks: number };
}

export interface MusicgenModel {
  config: MusicgenConfig;
  generate(options: Record<string, unknown>): Promise<AudioTensor>;
  dispose(): Promise<void>;
}

export type MusicgenTokenizer = (text: string) => Record<string, unknown>;

/** A loaded MusicGen: the model and the tokenizer that encodes its prompt. */
export interface Musicgen {
  model: MusicgenModel;
  tokenizer: MusicgenTokenizer;
}

/** Loaded MusicGen models kept resident; idle extras are evicted and disposed. */
const MAX_CACHED_MUSICGEN = 1;

const musicgenCache = new ModelCache<Musicgen>(
  MAX_CACHED_MUSICGEN,
  async ({ model }) => {
    await model.dispose();
  },
  ["generate"]
);

/**
 * The audio decoder stays at full precision whatever the rest uses: a
 * quantized `encodec_decode` turns the music into noise.
 */
function musicgenDtype(dtype: string | undefined): Record<string, string> {
  const weights = dtype ?? "q8";
  return {
    text_encoder: weights,
    decoder_model_merged: weights,
    encodec_decode: "fp32"
  };
}

/** Load (or reuse) MusicGen from `repoId`. */
export async function getMusicgen(
  repoId: string,
  dtype: string | undefined,
  requestedDevice: string | undefined
): Promise<Musicgen> {
  const device = resolveDevice(requestedDevice);
  const key = `${repoId}|${dtype ?? ""}|${device ?? ""}`;
  return musicgenCache.get(key, async () => {
    const { AutoTokenizer, MusicgenForConditionalGeneration } =
      await loadTransformers();
    if (!AutoTokenizer || !MusicgenForConditionalGeneration) {
      throw new Error(
        "This version of @huggingface/transformers cannot load MusicGen."
      );
    }
    return trackModelLoad(repoId, async (progress_callback) => {
      const modelOptions: Record<string, unknown> = {
        dtype: musicgenDtype(dtype),
        progress_callback
      };
      if (device) {
        modelOptions.device = device;
      }
      const [tokenizer, model] = await Promise.all([
        AutoTokenizer.from_pretrained(repoId, { progress_callback }),
        MusicgenForConditionalGeneration.from_pretrained(
          repoId,
          modelOptions
        )
      ]);
      return { model, tokenizer };
    });
  });
}

export interface MusicOptions {
  /** Clamped to 1..{@link MUSICGEN_MAX_SECONDS}. */
  durationSeconds?: number | null;
  guidanceScale?: number | null;
  signal?: AbortSignal;
}

export interface MusicResult {
  audio: Float32Array;
  sampling_rate: number;
}

/** The number of new tokens that make `seconds` of audio. */
export function musicgenTokens(
  seconds: number,
  config: MusicgenConfig
): number {
  // The delay pattern spends one step per codebook before the first frame.
  return (
    Math.ceil(seconds * config.audio_encoder.frame_rate) +
    config.decoder.num_codebooks
  );
}

/** Clamp a requested duration to what MusicGen can make. */
export function musicDuration(seconds: number | null | undefined): number {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) {
    return MUSICGEN_DEFAULT_SECONDS;
  }
  return Math.min(Math.max(seconds, 1), MUSICGEN_MAX_SECONDS);
}

/** Sample `prompt` as music. Throws `AbortError` when `signal` aborts. */
export async function generateMusic(
  musicgen: Musicgen,
  prompt: string,
  options: MusicOptions = {}
): Promise<MusicResult> {
  const { signal } = options;
  signal?.throwIfAborted();
  const { model, tokenizer } = musicgen;
  const { InterruptableStoppingCriteria: Stopper } = await loadTransformers();

  const generateOptions: Record<string, unknown> = {
    ...tokenizer(prompt),
    max_new_tokens: musicgenTokens(
      musicDuration(options.durationSeconds),
      model.config
    ),
    do_sample: true,
    guidance_scale: options.guidanceScale ?? MUSICGEN_DEFAULT_GUIDANCE
  };

  // Generation runs for a minute or more on a CPU, so an abort has to reach
  // the sampling loop, not wait for it.
  let cleanup = (): void => {};
  if (Stopper && signal) {
    const criteria = new Stopper();
    const onAbort = () => criteria.interrupt();
    signal.addEventListener("abort", onAbort, { once: true });
    cleanup = () => signal.removeEventListener("abort", onAbort);
    generateOptions.stopping_criteria = criteria;
  }

  try {
    const audio = await model.generate(generateOptions);
    signal?.throwIfAborted();
    return {
      audio: audio.data,
      sampling_rate: model.config.audio_encoder.sampling_rate
    };
  } finally {
    cleanup();
  }
}

export function clearMusicgenCache(): void {
  musicgenCache.clear();
}
