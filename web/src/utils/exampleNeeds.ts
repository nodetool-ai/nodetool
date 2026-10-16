/**
 * The short label an example card shows for what the example needs before it
 * runs. The server derives `ExampleNeeds` from the example's own document;
 * this only words it.
 */
import type { ExampleNeeds } from "@nodetool-ai/protocol";

export type { ExampleNeeds };

/** Needs of an example that asks for no model and no key. */
export const NO_EXAMPLE_NEEDS: ExampleNeeds = {
  modelKinds: [],
  requiredSettings: []
};

const MODEL_KIND_NOUNS: Record<string, string> = {
  language_model: "language",
  llama_model: "language",
  image_model: "image",
  video_model: "video",
  tts_model: "voice",
  asr_model: "transcription",
  music_model: "music",
  embedding_model: "embedding"
};

const article = (word: string): string =>
  /^[aeiou]/.test(word) ? "an" : "a";

export interface ExampleNeedsLabel {
  label: string;
  runsAsIs: boolean;
}

export const exampleNeedsLabel = (needs: ExampleNeeds): ExampleNeedsLabel => {
  if (needs.modelKinds.length > 0) {
    const nouns = [
      ...new Set(needs.modelKinds.map((kind) => MODEL_KIND_NOUNS[kind]))
    ];
    if (nouns.length > 1) {
      return { label: "Needs models", runsAsIs: false };
    }
    const noun = nouns[0];
    return {
      label: noun ? `Needs ${article(noun)} ${noun} model` : "Needs a model",
      runsAsIs: false
    };
  }
  if (needs.requiredSettings.length > 0) {
    return { label: "Needs an API key", runsAsIs: false };
  }
  return { label: "Runs as is", runsAsIs: true };
};

/**
 * A storyboard runs as is when every shot already has its clip. Any shot
 * still without one needs a video model to render it.
 */
export const storyboardNeeds = (summary: {
  shotCount: number;
  clipCount: number;
}): ExampleNeeds =>
  summary.clipCount < summary.shotCount
    ? { modelKinds: ["video_model"], requiredSettings: [] }
    : NO_EXAMPLE_NEEDS;

/**
 * Whether an example runs with no model and no key. Unknown needs count as
 * not ready, so a card with no pill never sorts ahead of a "Runs as is" one.
 */
export const runsAsIs = (needs: ExampleNeeds | null | undefined): boolean =>
  needs ? exampleNeedsLabel(needs).runsAsIs : false;

/**
 * The items that run as is first, each group in its original order. UX
 * research study 4: every Apps card in view needed models, so a newcomer
 * who wanted something to try right away opened one and never ran it.
 */
export const runsAsIsFirst = <T>(
  items: readonly T[],
  needsOf: (item: T) => ExampleNeeds | null | undefined
): T[] => {
  const ready = items.filter((item) => runsAsIs(needsOf(item)));
  const rest = items.filter((item) => !runsAsIs(needsOf(item)));
  return [...ready, ...rest];
};
