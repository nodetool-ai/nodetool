/**
 * Janus text-to-image, used by the provider's `textToImage`.
 *
 * Transformers.js has no text-to-image pipeline. Janus generates images as
 * tokens through `MultiModalityCausalLM.generate_images`, so the model loads
 * with its processor, the way MusicGen loads with its tokenizer.
 */

import { loadTransformers, resolveDevice } from "./transformers-base.js";
import type { RawImage } from "./transformers-base.js";
import { ModelCache } from "./model-cache.js";
import { trackModelLoad } from "./model-load-progress.js";

export function isJanusRepo(repoId: string | undefined): boolean {
  return !!repoId && /janus/i.test(repoId);
}

export interface JanusProcessor {
  (
    conversation: Array<{ role: string; content: string }>,
    options: { chat_template: string }
  ): Promise<Record<string, unknown>>;
  /** The image tokens one picture takes. Janus decodes 576 into 384×384. */
  num_image_tokens: number;
}

export interface JanusModel {
  generate_images(options: Record<string, unknown>): Promise<RawImage[]>;
  dispose(): Promise<void>;
}

/** A loaded Janus: the model and the processor that builds its prompt. */
export interface Janus {
  model: JanusModel;
  processor: JanusProcessor;
}

/** Loaded Janus models kept resident; idle extras are evicted and disposed. */
const MAX_CACHED_JANUS = 1;

const janusCache = new ModelCache<Janus>(
  MAX_CACHED_JANUS,
  async ({ model }) => {
    await model.dispose();
  },
  ["generate_images"]
);

/**
 * onnxruntime-node has no CPU kernel for the int8 vision tower
 * (`ConvInteger`), so the weights default to q4. The image heads and the
 * decoder stay at full precision.
 */
function janusDtype(dtype: string | undefined): Record<string, string> {
  const weights = dtype ?? "q4";
  return {
    prepare_inputs_embeds: weights,
    language_model: weights,
    lm_head: weights,
    gen_head: "fp32",
    gen_img_embeds: "fp32",
    image_decode: "fp32"
  };
}

/** Load (or reuse) Janus from `repoId`. */
export async function getJanus(
  repoId: string,
  dtype: string | undefined,
  requestedDevice: string | undefined
): Promise<Janus> {
  const device = resolveDevice(requestedDevice);
  const key = `${repoId}|${dtype ?? ""}|${device ?? ""}`;
  return janusCache.get(key, async () => {
    const { AutoProcessor, MultiModalityCausalLM } = await loadTransformers();
    if (!AutoProcessor || !MultiModalityCausalLM) {
      throw new Error(
        "This version of @huggingface/transformers cannot load Janus."
      );
    }
    return trackModelLoad(repoId, async (progress_callback) => {
      const modelOptions: Record<string, unknown> = {
        dtype: janusDtype(dtype),
        progress_callback
      };
      if (device) {
        modelOptions.device = device;
      }
      const [processor, model] = await Promise.all([
        AutoProcessor.from_pretrained(repoId, { progress_callback }),
        MultiModalityCausalLM.from_pretrained(repoId, modelOptions)
      ]);
      return { model, processor };
    });
  });
}

/** Generate one image for `prompt`. Throws `AbortError` when `signal` aborts. */
export async function generateJanusImage(
  janus: Janus,
  prompt: string,
  signal?: AbortSignal
): Promise<RawImage> {
  signal?.throwIfAborted();
  const { model, processor } = janus;
  const { InterruptableStoppingCriteria: Stopper } = await loadTransformers();

  const inputs = await processor([{ role: "<|User|>", content: prompt }], {
    chat_template: "text_to_image"
  });
  const tokens = processor.num_image_tokens;
  const generateOptions: Record<string, unknown> = {
    ...inputs,
    min_new_tokens: tokens,
    max_new_tokens: tokens,
    do_sample: true
  };

  // Sampling takes most of a minute on a CPU, so an abort has to reach the
  // sampling loop, not wait for it.
  let cleanup = (): void => {};
  if (Stopper && signal) {
    const criteria = new Stopper();
    const onAbort = () => criteria.interrupt();
    signal.addEventListener("abort", onAbort, { once: true });
    cleanup = () => signal.removeEventListener("abort", onAbort);
    generateOptions.stopping_criteria = criteria;
  }

  try {
    // An interrupt cuts the token stream short, and the decoder then fails
    // on the partial grid. Report the abort, not that failure.
    const [image] = await model.generate_images(generateOptions).catch(
      (error: unknown) => {
        signal?.throwIfAborted();
        throw error;
      }
    );
    signal?.throwIfAborted();
    if (!image) {
      throw new Error("Janus returned no image.");
    }
    return image;
  } finally {
    cleanup();
  }
}

export function clearJanusCache(): void {
  janusCache.clear();
}
