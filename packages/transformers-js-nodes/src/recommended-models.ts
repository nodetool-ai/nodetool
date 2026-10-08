/**
 * Curated recommended-model lists for each `tjs.*` task type.
 *
 * Transformers.js requires ONNX-exported repos (the `Xenova/*` and
 * `onnx-community/*` mirrors are the canonical sources). The Python-side
 * `nodetool-huggingface` recommended lists are mostly PyTorch-only and would
 * fail to load here, so we maintain a parallel ONNX-compatible registry.
 *
 * This registry is the single source of truth for:
 *   1. The default `repo_id` baked into each node's `model` prop default.
 *   2. The "recommended" entries returned by the
 *      `models.transformersJs.byType` tRPC endpoint.
 */

export interface TjsModelRef {
  /** HuggingFace repo id, e.g. `Xenova/whisper-tiny.en`. */
  repo_id: string;
  /** Optional sub-path / file selector (rare for Transformers.js). */
  path?: string | null;
}

const MODELS: Record<string, readonly TjsModelRef[]> = {
  "tjs.text_classification": [
    { repo_id: "Xenova/distilbert-base-uncased-finetuned-sst-2-english" },
    { repo_id: "Xenova/twitter-roberta-base-sentiment-latest" },
    { repo_id: "Xenova/bert-base-multilingual-uncased-sentiment" },
    { repo_id: "Xenova/toxic-bert" }
  ],

  "tjs.token_classification": [
    { repo_id: "Xenova/bert-base-multilingual-cased-ner-hrl" },
    { repo_id: "Xenova/bert-base-NER" },
    { repo_id: "Xenova/distilbert-base-multilingual-cased-ner-hrl" }
  ],

  "tjs.question_answering": [
    { repo_id: "Xenova/distilbert-base-uncased-distilled-squad" },
    { repo_id: "Xenova/distilbert-base-cased-distilled-squad" },
    { repo_id: "Xenova/bert-large-uncased-whole-word-masking-finetuned-squad" }
  ],

  "tjs.summarization": [
    { repo_id: "Xenova/distilbart-cnn-6-6" },
    { repo_id: "Xenova/distilbart-cnn-12-6" },
    { repo_id: "Xenova/bart-large-cnn" },
    { repo_id: "Xenova/t5-small" }
  ],

  "tjs.translation": [
    { repo_id: "Xenova/nllb-200-distilled-600M" },
    { repo_id: "Xenova/m2m100_418M" },
    { repo_id: "Xenova/opus-mt-en-de" },
    { repo_id: "Xenova/opus-mt-en-fr" },
    { repo_id: "Xenova/t5-base" }
  ],

  // transformers.js 3.x supports qwen3, gemma3_text, smollm3 and llama, but
  // not qwen3_5 or gemma4.
  "tjs.text_generation": [
    { repo_id: "onnx-community/Qwen3-1.7B-ONNX" },
    { repo_id: "onnx-community/Qwen3-0.6B-ONNX" },
    { repo_id: "onnx-community/Qwen3-4B-ONNX" },
    { repo_id: "onnx-community/gemma-3-1b-it-ONNX" },
    { repo_id: "HuggingFaceTB/SmolLM3-3B-ONNX" },
    { repo_id: "HuggingFaceTB/SmolLM2-1.7B-Instruct" },
    { repo_id: "HuggingFaceTB/SmolLM2-360M-Instruct" },
    { repo_id: "HuggingFaceTB/SmolLM2-135M-Instruct" }
  ],

  "tjs.fill_mask": [
    { repo_id: "Xenova/bert-base-uncased" },
    { repo_id: "Xenova/distilbert-base-uncased" },
    { repo_id: "Xenova/roberta-base" }
  ],

  "tjs.feature_extraction": [
    { repo_id: "nomic-ai/nomic-embed-text-v1.5" },
    { repo_id: "Xenova/all-MiniLM-L6-v2" },
    { repo_id: "Xenova/bge-m3" },
    { repo_id: "jinaai/jina-embeddings-v2-base-code" }
  ],

  // Cross-encoders: the provider scores query/document pairs with them.
  "tjs.text_ranking": [
    { repo_id: "mixedbread-ai/mxbai-rerank-xsmall-v1" },
    { repo_id: "jinaai/jina-reranker-v2-base-multilingual" }
  ],

  "tjs.zero_shot_classification": [
    { repo_id: "Xenova/distilbert-base-uncased-mnli" },
    { repo_id: "Xenova/bart-large-mnli" },
    { repo_id: "Xenova/mDeBERTa-v3-base-mnli-xnli" },
    { repo_id: "Xenova/nli-deberta-v3-base" }
  ],

  "tjs.image_classification": [
    { repo_id: "Xenova/vit-base-patch16-224" },
    { repo_id: "Xenova/resnet-50" },
    { repo_id: "Xenova/mobilevit-small" },
    { repo_id: "Xenova/swin-tiny-patch4-window7-224" },
    { repo_id: "Xenova/nsfw_image_detection" }
  ],

  "tjs.object_detection": [
    { repo_id: "Xenova/detr-resnet-50" },
    { repo_id: "onnx-community/rtdetr_r50vd" }
  ],

  // RMBG-1.4 weights are licensed for non-commercial use only.
  "tjs.background_removal": [
    { repo_id: "briaai/RMBG-1.4" },
    { repo_id: "onnx-community/BiRefNet_lite-ONNX" },
    { repo_id: "onnx-community/BiRefNet-ONNX" }
  ],

  "tjs.depth_estimation": [
    { repo_id: "onnx-community/depth-anything-v2-small" }
  ],

  // The image-to-text pipeline loads only vision-encoder-decoder, idefics3 and
  // smolvlm models in transformers.js 3.x. Florence-2 and BLIP do not load.
  "tjs.image_to_text": [
    { repo_id: "Xenova/vit-gpt2-image-captioning" },
    { repo_id: "Xenova/trocr-small-printed" },
    { repo_id: "Xenova/trocr-small-handwritten" }
  ],

  "tjs.zero_shot_image_classification": [
    { repo_id: "onnx-community/siglip2-base-patch16-256-ONNX" },
    { repo_id: "onnx-community/siglip2-base-patch16-384-ONNX" },
    { repo_id: "onnx-community/siglip2-large-patch16-384-ONNX" },
    { repo_id: "Xenova/clip-vit-base-patch32" },
    { repo_id: "Xenova/clip-vit-large-patch14" }
  ],

  "tjs.automatic_speech_recognition": [
    { repo_id: "Xenova/whisper-base" },
    { repo_id: "Xenova/whisper-tiny" },
    { repo_id: "distil-whisper/distil-large-v3" },
    { repo_id: "onnx-community/whisper-large-v3-turbo" }
  ],

  "tjs.audio_classification": [
    { repo_id: "Xenova/wav2vec2-base-superb-er" },
    { repo_id: "Xenova/wav2vec2-base-superb-ks" },
    { repo_id: "Xenova/ast-finetuned-audioset-10-10-0.4593" }
  ],

  "tjs.text_to_speech": [
    { repo_id: "onnx-community/Kokoro-82M-v1.0-ONNX" },
    { repo_id: "Xenova/mms-tts-fra" },
    { repo_id: "Xenova/mms-tts-deu" }
  ]
};

/** All known `tjs.*` model types. */
export const TJS_MODEL_TYPES: readonly string[] = Object.keys(MODELS);

/** Recommended models for a given `tjs.*` type, or empty if unknown. */
export function recommendedFor(modelType: string): readonly TjsModelRef[] {
  return MODELS[modelType] ?? [];
}

/**
 * Default repo id for a `tjs.*` type (the first recommendation). Used as the
 * baked-in default value for each node's `model` prop so the prop default and
 * the picker's "recommended" entries can never drift.
 *
 * Throws if `modelType` is not registered — this is a programming error.
 */
export function defaultRepoFor(modelType: string): string {
  const list = MODELS[modelType];
  if (!list || list.length === 0) {
    throw new Error(
      `defaultRepoFor: no recommended models registered for "${modelType}". ` +
        `Add an entry to recommended-models.ts.`
    );
  }
  return list[0].repo_id;
}
