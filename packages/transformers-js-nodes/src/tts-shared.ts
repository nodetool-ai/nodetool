import { KokoroTTS } from "kokoro-js";
import { loadTransformers } from "./transformers-base.js";

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

const kokoroCache = new Map<string, Promise<KokoroTTS>>();

/**
 * Load (or reuse) a KokoroTTS instance for the given repo. The cache key
 * includes dtype/device so concurrent variants don't collide. We always
 * `await loadTransformers()` first so kokoro-js inherits our cache directory
 * and remote-models config from the shared `@huggingface/transformers` env.
 */
export async function getKokoro(
  repoId: string,
  dtype: string | undefined,
  device: string | undefined
): Promise<KokoroTTS> {
  const key = `${repoId}|${dtype ?? ""}|${device ?? ""}`;
  let pending = kokoroCache.get(key);
  if (!pending) {
    pending = (async () => {
      await loadTransformers();
      const opts: Record<string, unknown> = {};
      if (dtype) opts.dtype = dtype;
      if (device) opts.device = device;
      return KokoroTTS.from_pretrained(repoId, opts as never);
    })();
    kokoroCache.set(key, pending);
    pending.catch(() => kokoroCache.delete(key));
  }
  return pending;
}

/** Reset the Kokoro instance cache. Intended for tests. */
export function clearKokoroCache(): void {
  kokoroCache.clear();
}
