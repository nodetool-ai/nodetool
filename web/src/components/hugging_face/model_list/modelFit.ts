import type { UnifiedModel } from "../../../stores/ApiTypes";
import { classifyFit, type FitLevel } from "../onboarding/onboardingCatalog";

/**
 * Hardware-fit and goal classification for the model manager list.
 *
 * The onboarding catalog carries hand-written memory figures; the general
 * lists (installed / recommended / hub) only have `size_on_disk`. Model
 * weights load into GPU or unified memory roughly at their on-disk size, so
 * that size is the memory estimate here — `classifyFit`'s built-in headroom
 * (1.15×) covers activations and context on top of it.
 */

/** Estimated memory (GB) needed to run the model, or null when unknowable. */
export const estimateRequiredGb = (model: UnifiedModel): number | null => {
  const bytes = model.size_on_disk;
  if (!bytes || bytes <= 0) {
    return null;
  }
  return bytes / 1024 ** 3;
};

/** Classify a model against the machine's memory budget (GB). */
export const classifyModelFit = (
  model: UnifiedModel,
  budgetGb: number | null
): FitLevel => {
  const requiredGb = estimateRequiredGb(model);
  if (requiredGb == null) {
    return "unknown";
  }
  return classifyFit(requiredGb, budgetGb);
};

const FIT_ORDER = {
  fits: 0,
  tight: 1,
  unknown: 2,
  over: 3
} satisfies Record<FitLevel, number>;

/**
 * Best-fit-first comparator for the "Best fit" sort: models that fit come
 * first (largest fitting model on top, since bigger usually means better),
 * then tight, then unknown-size, then over (smallest-over first — closest to
 * runnable).
 */
export const compareModelsByFit = (
  a: UnifiedModel,
  b: UnifiedModel,
  budgetGb: number | null
): number => {
  const fa = classifyModelFit(a, budgetGb);
  const fb = classifyModelFit(b, budgetGb);
  if (fa !== fb) {
    return FIT_ORDER[fa] - FIT_ORDER[fb];
  }
  const sa = a.size_on_disk || 0;
  const sb = b.size_on_disk || 0;
  // Within "over", smaller (closer to fitting) first; otherwise larger first.
  return fa === "over" ? sa - sb : sb - sa;
};

/** A user goal the manager can filter/suggest models for. */
export interface ModelGoal {
  id: string;
  label: string;
  description: string;
  /** Normalized task tokens (dash-cased, no `hf.`/`tjs.` prefix) this goal covers. */
  tasks: ReadonlySet<string>;
}

const goal = (
  id: string,
  label: string,
  description: string,
  tasks: string[]
): ModelGoal => ({ id, label, description, tasks: new Set(tasks) });

/**
 * The goal catalog. Matching runs over a model's `type` and `pipeline_tag`,
 * both normalized to the Hub's dash-cased task names.
 */
export const MODEL_GOALS: readonly ModelGoal[] = [
  goal("chat", "Chat & agents", "Write, reason, and use tools with a language model", [
    "text-generation",
    "text2text-generation",
    "audio-text-to-text",
    "any-to-any"
  ]),
  goal("image-gen", "Create images", "Generate or restyle images from prompts", [
    "text-to-image",
    "image-to-image",
    "inpainting"
  ]),
  goal("vision", "Understand images", "Describe, classify, or analyze images and documents", [
    "image-text-to-text",
    "image-to-text",
    "image-classification",
    "object-detection",
    "image-segmentation",
    "visual-question-answering",
    "document-question-answering",
    "zero-shot-image-classification",
    "depth-estimation",
    "mask-generation"
  ]),
  goal("transcribe", "Transcribe speech", "Turn audio recordings into text", [
    "automatic-speech-recognition"
  ]),
  goal("speech", "Generate speech & audio", "Voice lines, narration, and sound from text", [
    "text-to-speech",
    "text-to-audio",
    "audio-to-audio"
  ]),
  goal("video", "Create video", "Generate video from prompts or still images", [
    "text-to-video",
    "image-to-video"
  ]),
  goal("embedding", "Search & RAG", "Embeddings for semantic search over your documents", [
    "feature-extraction",
    "sentence-similarity"
  ])
];

/**
 * GGUF chat and embedding models share the one `llama_model` type, so the
 * type alone can't split them; the model families all carry these markers in
 * their names.
 */
const LLAMA_EMBED_NAME = /embed|bge|minilm|e5|arctic/i;

const normalizeTask = (raw: string): string =>
  raw
    .replace(/^[a-z0-9_]+\./i, "")
    .replace(/_/g, "-")
    .toLowerCase();

/** Which goals a model serves, from its type and pipeline tag. */
export const goalsForModel = (model: UnifiedModel): Set<string> => {
  const tokens = new Set<string>();
  for (const raw of [model.type, model.pipeline_tag]) {
    if (raw) {
      tokens.add(normalizeTask(raw));
    }
  }
  const result = new Set<string>();
  for (const candidate of MODEL_GOALS) {
    for (const token of tokens) {
      if (candidate.tasks.has(token)) {
        result.add(candidate.id);
      }
    }
  }
  if (model.type === "llama_model") {
    const name = model.name || model.id || "";
    result.add(LLAMA_EMBED_NAME.test(name) ? "embedding" : "chat");
  }
  return result;
};
