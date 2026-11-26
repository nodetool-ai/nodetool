/**
 * CLIP embeddings: text and images in one space, so a text query ranks
 * images by what they show. The `feature-extraction` and
 * `image-feature-extraction` pipelines return CLIP's unprojected hidden
 * states, which are not comparable across the two encoders, so this module
 * loads the projection models directly and reads `text_embeds` and
 * `image_embeds`.
 */

import {
  bytesToRawImage,
  loadTransformers,
  trackModelLoad,
  type ClipImageProcessor,
  type ClipTextModel,
  type ClipTokenizer,
  type ClipVisionModel
} from "@nodetool-ai/transformers-js-nodes";
import type { EmbeddingImage } from "@nodetool-ai/runtime";

/** The default local image embedding model: 512 dimensions, quantized weights. */
export const DEFAULT_CLIP_MODEL = "Xenova/clip-vit-base-patch32";

/**
 * Quantized weights: the two encoders load in about a quarter of the
 * full-precision size, which matters in the desktop indexer process.
 */
const CLIP_DTYPE = "q8";

/**
 * Whether `model` names an OpenAI CLIP checkpoint, such as
 * `Xenova/clip-vit-base-patch32`. Jina CLIP has its own model classes and is
 * not one.
 */
export function isClipModel(model: string): boolean {
  const name = model.split("/").pop()?.toLowerCase() ?? "";
  return /(^|[-_])clip([-_]|$)/.test(name) && !name.startsWith("jina");
}

const NO_CLIP = "This version of @huggingface/transformers cannot load CLIP models.";

interface TextEncoder {
  tokenizer: ClipTokenizer;
  model: ClipTextModel;
}

interface ImageEncoder {
  processor: ClipImageProcessor;
  model: ClipVisionModel;
}

/** The loaded encoder of each side. A different model replaces it and frees the old one. */
let textCache: { model: string; encoder: Promise<TextEncoder> } | null = null;
let imageCache: { model: string; encoder: Promise<ImageEncoder> } | null = null;

function release(encoder: Promise<{ model: { dispose?(): Promise<void> } }>): void {
  void encoder.then((loaded) => loaded.model.dispose?.()).catch(() => undefined);
}

function textEncoder(model: string): Promise<TextEncoder> {
  if (textCache?.model === model) return textCache.encoder;
  if (textCache) release(textCache.encoder);
  const encoder = (async (): Promise<TextEncoder> => {
    const { CLIPTokenizer, CLIPTextModelWithProjection } = await loadTransformers();
    if (!CLIPTokenizer || !CLIPTextModelWithProjection) throw new Error(NO_CLIP);
    return trackModelLoad(model, async (progress_callback) => {
      const [tokenizer, loaded] = await Promise.all([
        CLIPTokenizer.from_pretrained(model, { progress_callback }),
        CLIPTextModelWithProjection.from_pretrained(model, { dtype: CLIP_DTYPE, progress_callback })
      ]);
      return { tokenizer, model: loaded };
    });
  })();
  textCache = { model, encoder };
  encoder.catch(() => {
    if (textCache?.encoder === encoder) textCache = null;
  });
  return encoder;
}

function imageEncoder(model: string): Promise<ImageEncoder> {
  if (imageCache?.model === model) return imageCache.encoder;
  if (imageCache) release(imageCache.encoder);
  const encoder = (async (): Promise<ImageEncoder> => {
    const { CLIPImageProcessor, CLIPVisionModelWithProjection } = await loadTransformers();
    if (!CLIPImageProcessor || !CLIPVisionModelWithProjection) throw new Error(NO_CLIP);
    return trackModelLoad(model, async (progress_callback) => {
      const [processor, loaded] = await Promise.all([
        CLIPImageProcessor.from_pretrained(model, { progress_callback }),
        CLIPVisionModelWithProjection.from_pretrained(model, { dtype: CLIP_DTYPE, progress_callback })
      ]);
      return { processor, model: loaded };
    });
  })();
  imageCache = { model, encoder };
  encoder.catch(() => {
    if (imageCache?.encoder === encoder) imageCache = null;
  });
  return encoder;
}

/** Embed texts with CLIP's text encoder, in the space of its image embeddings. */
export async function clipTextEmbedding(texts: string[], model: string): Promise<number[][]> {
  const encoder = await textEncoder(model);
  // CLIP's text encoder reads at most 77 tokens; longer input is cut there.
  const inputs = encoder.tokenizer(texts, { padding: true, truncation: true });
  const { text_embeds } = await encoder.model(inputs);
  return text_embeds.tolist();
}

/** Embed images with CLIP's vision encoder. */
export async function clipImageEmbedding(images: EmbeddingImage[], model: string): Promise<number[][]> {
  if (images.length === 0) return [];
  const encoder = await imageEncoder(model);
  const raw = await Promise.all(images.map((image) => bytesToRawImage(image.data, image.mimeType)));
  const inputs = await encoder.processor(raw);
  const { image_embeds } = await encoder.model(inputs);
  return image_embeds.tolist();
}

/** Drop the loaded encoders. Intended for tests. */
export function clearClipCache(): void {
  textCache = null;
  imageCache = null;
}
