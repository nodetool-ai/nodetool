/**
 * Model-name normalization shared by the GenSpend sync's matcher.
 *
 * Providers write the same model a dozen ways — `FLUX.2 [pro]`,
 * `black-forest-labs/FLUX.2-pro`, `flux-2-pro`, `Seedream4.0 - Text to Image`.
 * These helpers reduce all of them to one comparison key so a GenSpend model
 * can be recognized as a model NodeTool already ships, without any fuzzy or
 * prefix matching: keys either land on the exact same string or they don't.
 */

/**
 * Task suffixes providers append to an id or title. Stripping them lets
 * `seedance-2-text-to-video` meet `seedance-2`, which is what GenSpend prices —
 * one number per model per provider.
 */
const TASK_SUFFIXES = [
  "text-to-image",
  "image-to-image",
  "text-to-video",
  "image-to-video",
  "video-to-video",
  "reference-to-video",
  "first-last-frame-to-video",
  "text-to-speech",
  "speech-to-text",
  "text-to-audio",
  "text-to-music",
  "text-to-dialogue",
  "voice-clone",
  "lip-sync",
  "lipsync",
  "upscale",
  "inpaint",
  "outpaint",
  "edit",
  "generate",
  "generation",
  "preview"
];

const TASK_SET = new Set(TASK_SUFFIXES);
const MAX_SUFFIX_WORDS = Math.max(
  ...TASK_SUFFIXES.map((t) => t.split("-").length)
);

/**
 * Tasks that are a different product from the generation GenSpend prices.
 * An upscaler or a lip-sync endpoint bills on its own basis, so it must never
 * inherit the model's generation price.
 */
export const NON_GENERATION_TASKS = new Set([
  "upscale",
  "lip-sync",
  "lipsync",
  "voice-clone",
  "speech-to-text",
  "video-to-video"
]);

/**
 * Company names providers prefix onto a model id (`MiniMax-Hailuo-02`,
 * `bytedance/seedream-v5.0-pro`) while GenSpend names the model alone
 * (`hailuo-02`, `seedream-5-pro`). Indexing the un-prefixed form too lets the
 * two meet.
 *
 * Only names that are a company and never a model family: `kling`, `wan`,
 * `qwen`, `ideogram` and friends are both, and stripping them would leave a
 * bare version number that could match anything.
 */
const VENDOR_PREFIXES = new Set([
  "bytedance",
  "minimax",
  "google",
  "openai",
  "alibaba",
  "kwaivgi",
  "black-forest-labs",
  "xai",
  "microsoft",
  "tencent",
  "elevenlabs",
  "stability-ai",
  "resemble-ai",
  "canopylabs",
  "hexgrad",
  "luma",
  "moonvalley",
  "deepmind"
]);

const MAX_VENDOR_WORDS = Math.max(
  ...[...VENDOR_PREFIXES].map((v) => v.split("-").length)
);

/** `minimax-hailuo-2` → `hailuo-2`; anything not vendor-prefixed is unchanged. */
export function stripVendor(key) {
  const parts = key ? key.split("-") : [];
  for (let n = MAX_VENDOR_WORDS; n >= 1; n -= 1) {
    if (parts.length > n && VENDOR_PREFIXES.has(parts.slice(0, n).join("-"))) {
      return parts.slice(n).join("-");
    }
  }
  return key;
}

/**
 * One comparison key: lowercase, punctuation collapsed to `-`, letter/digit
 * boundaries split (`seedream3` → `seedream-3`), `v2` version prefixes dropped,
 * and trailing `.0` removed so `2.0` meets `2`.
 */
export function normalize(raw) {
  if (raw === null || raw === undefined) return "";
  let s = String(raw).toLowerCase().replace(/[–—]/g, "-");
  s = s.replace(/([a-z])(\d)/g, "$1-$2").replace(/(\d)([a-z])/g, "$1-$2");
  s = s.replace(/[^a-z0-9]+/g, "-");
  s = s.replace(/(^|-)v-(\d)/g, "$1$2");
  s = s.replace(/-0(?=-|$)/g, "");
  return s.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}

/** Drop trailing task words: `seedance-2-text-to-video` → `seedance-2`. */
export function stripTasks(key) {
  let parts = key ? key.split("-") : [];
  for (let cut = true; cut && parts.length > 1; ) {
    cut = false;
    for (let n = MAX_SUFFIX_WORDS; n >= 1; n -= 1) {
      if (parts.length > n && TASK_SET.has(parts.slice(-n).join("-"))) {
        parts = parts.slice(0, -n);
        cut = true;
        break;
      }
    }
  }
  return parts.join("-");
}

/** True when a model id/title names a task priced separately from generation. */
export function isNonGenerationTask(...values) {
  for (const value of values) {
    const key = normalize(value);
    if (!key) continue;
    const parts = key.split("-");
    for (let n = 1; n <= Math.min(2, parts.length); n += 1) {
      if (NON_GENERATION_TASKS.has(parts.slice(-n).join("-"))) return true;
    }
  }
  return false;
}

/**
 * Task suffix → the capability flag GenSpend publishes for it. A model whose
 * capabilities refute a task must not be priced on an endpoint for that task:
 * `bria-3-2` reports `i2i: false`, so its per-image price never lands on an
 * image-to-image endpoint.
 *
 * `edit` maps to `i2i` because that is what an edit endpoint is — an image in,
 * an image out.
 */
const CAPABILITY_BY_TASK = {
  "text-to-image": "t2i",
  "image-to-image": "i2i",
  edit: "i2i",
  inpaint: "i2i",
  outpaint: "i2i",
  "text-to-video": "t2v",
  "image-to-video": "i2v",
  "reference-to-video": "r2v",
  "first-last-frame-to-video": "i2v",
  "video-to-video": "v2v"
};

/** The capability flag a model id/title implies, or null when it names no task. */
export function capabilityForModelId(...values) {
  for (const value of values) {
    const key = normalize(value);
    if (!key) continue;
    const parts = key.split("-");
    for (let n = MAX_SUFFIX_WORDS; n >= 1; n -= 1) {
      const suffix = parts.slice(-n).join("-");
      if (CAPABILITY_BY_TASK[suffix]) return CAPABILITY_BY_TASK[suffix];
    }
  }
  return null;
}

/**
 * Every key a model id or display name should be findable under — the whole
 * string, its task-stripped form, and the same two for the id's path tail
 * (`fal-ai/bytedance/seedream/v4` also answers to `seedream-4`).
 */
export function modelKeys(...values) {
  const keys = new Set();
  const add = (value) => {
    const whole = normalize(value);
    if (!whole) return;
    for (const key of [whole, stripVendor(whole)]) {
      if (!key) continue;
      keys.add(key);
      const stripped = stripTasks(key);
      if (stripped) keys.add(stripped);
    }
  };

  for (const value of values) {
    if (!value) continue;
    add(value);
    const segments = String(value).split("/");
    if (segments.length > 1) {
      add(segments.slice(1).join("-"));
      add(segments[segments.length - 1]);
    }
  }
  keys.delete("");
  return keys;
}
