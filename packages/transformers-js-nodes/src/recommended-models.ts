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

  "tjs.text_generation": [
    { repo_id: "onnx-community/Llama-3.2-1B-Instruct" },
    { repo_id: "onnx-community/Qwen2.5-0.5B-Instruct" },
    { repo_id: "Xenova/Qwen1.5-0.5B-Chat" },
    { repo_id: "HuggingFaceTB/SmolLM2-360M-Instruct" },
    { repo_id: "Xenova/TinyLlama-1.1B-Chat-v1.0" },
    { repo_id: "Xenova/Phi-3-mini-4k-instruct" }
  ],

  "tjs.fill_mask": [
    { repo_id: "Xenova/bert-base-uncased" },
    { repo_id: "Xenova/distilbert-base-uncased" },
    { repo_id: "Xenova/roberta-base" }
  ],

  "tjs.feature_extraction": [
    { repo_id: "Xenova/all-MiniLM-L6-v2" },
    { repo_id: "Xenova/all-mpnet-base-v2" },
    { repo_id: "Xenova/bge-base-en-v1.5" },
    { repo_id: "Xenova/bge-small-en-v1.5" },
    { repo_id: "mixedbread-ai/mxbai-embed-large-v1" }
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
    { repo_id: "Xenova/detr-resnet-101" },
    { repo_id: "Xenova/yolos-tiny" },
    { repo_id: "Xenova/yolos-small" },
    { repo_id: "Xenova/table-transformer-detection" }
  ],

  "tjs.image_to_text": [
    { repo_id: "Xenova/vit-gpt2-image-captioning" },
    { repo_id: "Xenova/blip-image-captioning-base" },
    { repo_id: "Xenova/blip-image-captioning-large" },
    { repo_id: "Xenova/trocr-small-printed" }
  ],

  "tjs.zero_shot_image_classification": [
    { repo_id: "Xenova/clip-vit-base-patch32" },
    { repo_id: "Xenova/clip-vit-base-patch16" },
    { repo_id: "Xenova/clip-vit-large-patch14" },
    { repo_id: "Xenova/siglip-base-patch16-224" }
  ],

  "tjs.automatic_speech_recognition": [
    { repo_id: "Xenova/whisper-tiny.en" },
    { repo_id: "Xenova/whisper-base.en" },
    { repo_id: "Xenova/whisper-small.en" },
    { repo_id: "Xenova/whisper-tiny" },
    { repo_id: "Xenova/whisper-base" },
    { repo_id: "onnx-community/whisper-large-v3-turbo" },
    { repo_id: "Xenova/wav2vec2-base-960h" }
  ],

  "tjs.audio_classification": [
    { repo_id: "Xenova/wav2vec2-base-superb-er" },
    { repo_id: "Xenova/wav2vec2-base-superb-ks" },
    { repo_id: "Xenova/ast-finetuned-audioset-10-10-0.4593" }
  ],

  "tjs.text_to_speech": [
    { repo_id: "Xenova/speecht5_tts" },
    { repo_id: "Xenova/mms-tts-eng" },
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
