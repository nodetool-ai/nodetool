/**
 * The Studio model policy: Studio runs on NodeTool's own managed models — the
 * `nodetool` provider — so a beginner never needs an API key. Those calls run
 * on platform keys and are metered against the credit balance; users who dig
 * into the reused editors from the workspace can still pick any BYOK provider,
 * unmetered.
 *
 * Studio shows a plain dropdown over the few curated options per role rather
 * than the full provider browser, and shows nothing at all for the language
 * model: the director is pinned, because picking the brain behind the
 * assistants is not a beginner's decision.
 *
 * The catalog itself (ids, names, blurbs, delegates) is `NODETOOL_MODELS` in
 * `@nodetool-ai/protocol` — this file adapts it to the value shapes the web
 * model properties use.
 */

import {
  NODETOOL_PROVIDER_ID,
  nodetoolModelsOfKind,
  type NodetoolModelDef
} from "@nodetool-ai/protocol";
import type {
  ImageModelValue,
  LanguageModelValue,
  TTSModelValue,
  VideoModelValue
} from "../stores/ApiTypes";

const provider = NODETOOL_PROVIDER_ID;

const toImageModel = (def: NodetoolModelDef): ImageModelValue => ({
  type: "image_model",
  id: def.id,
  provider,
  name: def.name,
  path: ""
});

const toVideoModel = (def: NodetoolModelDef): VideoModelValue => ({
  type: "video_model",
  id: def.id,
  provider,
  name: def.name
});

const toTTSModel = (def: NodetoolModelDef, voice?: string): TTSModelValue => ({
  type: "tts_model",
  id: def.id,
  provider,
  name: def.name,
  voices: (def.voices ?? []).map((v) => v.id),
  selected_voice: voice ?? def.voices?.[0]?.id ?? ""
});

/** Directs screenplays and drives the in-editor assistants. Not selectable. */
export const STUDIO_DIRECTOR_MODEL: LanguageModelValue = {
  type: "language_model",
  id: nodetoolModelsOfKind("language")[0].id,
  provider,
  name: nodetoolModelsOfKind("language")[0].name
};

export interface CuratedOption<T> {
  /** What the dropdown selects on. The model id, or the voice id for voices. */
  id: string;
  /**
   * The curated model behind the option — the same as {@link id} except for a
   * voice, where several options share one model. The server whitelist
   * (`spendableModels`) is expressed in these ids.
   */
  modelId: string;
  value: T;
  /** User-facing name, e.g. "Balanced". */
  label: string;
  /** One line on what the choice costs you and buys you. */
  blurb: string;
  /** Capabilities, e.g. `["text_to_image", "image_to_image"]`. */
  tasks: string[];
}

const options = <T>(
  kind: "image" | "video",
  map: (def: NodetoolModelDef) => T
): CuratedOption<T>[] =>
  nodetoolModelsOfKind(kind).map((def) => ({
    id: def.id,
    modelId: def.id,
    value: map(def),
    label: def.name,
    blurb: def.blurb ?? "",
    tasks: def.tasks ?? []
  }));

/** The curated options that can do at least one of the requested tasks. */
export const forTasks = <T>(
  list: CuratedOption<T>[],
  task?: string | string[]
): CuratedOption<T>[] => {
  const wanted = task ? (Array.isArray(task) ? task : [task]) : [];
  if (wanted.length === 0) return list;
  return list.filter((option) => wanted.some((t) => option.tasks.includes(t)));
};

/** Renders storyboard keyframe stills, cheapest first. */
export const STUDIO_STILL_MODELS: CuratedOption<ImageModelValue>[] = options(
  "image",
  toImageModel
);

/** Animates keyframes into shot clips, cheapest first. */
export const STUDIO_CLIP_MODELS: CuratedOption<VideoModelValue>[] = options(
  "video",
  toVideoModel
);

/**
 * Reads a script aloud. A curated voice is one model + one voice, so the
 * dropdown is a flat list of voices rather than a model picker plus a voice
 * picker.
 */
export const STUDIO_VOICES: CuratedOption<TTSModelValue>[] =
  nodetoolModelsOfKind("tts").flatMap((def) =>
    (def.voices ?? []).map((voice) => ({
      id: voice.id,
      modelId: def.id,
      value: toTTSModel(def, voice.id),
      label: voice.name,
      blurb: "",
      tasks: def.tasks ?? []
    }))
  );

/**
 * What a new Studio project starts on. The still default is the middle tier
 * rather than the cheapest: it is the cheapest one that can work from an
 * entity's reference images, and a beginner who adds a character expects it
 * to look like that character.
 */
export const STUDIO_STILL_MODEL: ImageModelValue =
  optionById(STUDIO_STILL_MODELS, "nodetool/nano-banana") ??
  STUDIO_STILL_MODELS[0].value;
export const STUDIO_CLIP_MODEL: VideoModelValue =
  optionById(STUDIO_CLIP_MODELS, "nodetool/kling-turbo") ??
  STUDIO_CLIP_MODELS[0].value;
export const STUDIO_VOICE: TTSModelValue | undefined = STUDIO_VOICES[0]?.value;

function optionById<T>(list: CuratedOption<T>[], id: string): T | undefined {
  return list.find((option) => option.id === id)?.value;
}
