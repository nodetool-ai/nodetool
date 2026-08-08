/**
 * The curated catalog behind the `nodetool` provider — NodeTool's own managed
 * models. Each entry names the delegate that actually serves it; the provider
 * runs the delegate on platform-owned keys and the spend is metered against
 * the user's credit balance. BYOK providers are untouched by any of this.
 *
 * The catalog is also the Studio beginner shell's model menu: the shell shows
 * a plain dropdown of the entries of one kind instead of the full provider
 * browser, so `name` and `blurb` are user-facing copy and the order here is
 * the order a beginner sees (cheapest/fastest first, default first).
 *
 * Pure data on purpose: the runtime provider routes with it, model-pricing
 * translates ids through it, and the web curated-model config points at it.
 */

export interface NodetoolVoiceDef {
  /** Voice id the delegate endpoint accepts. */
  id: string;
  /** User-facing voice name. */
  name: string;
}

export interface NodetoolModelDef {
  /** Public model id under the `nodetool` provider, e.g. "nodetool/flux-schnell". */
  id: string;
  name: string;
  kind: NodetoolModelKind;
  /** One line of user-facing copy for the Studio dropdown. */
  blurb?: string;
  /** Image/video task hints for the pickers. */
  tasks?: string[];
  delegate: {
    provider: string;
    model: string;
  };
  /**
   * Delegate serving image-to-image, when the endpoint behind {@link delegate}
   * only takes text. FAL splits most image families into a generate and an
   * edit endpoint; a curated still model claims `image_to_image` only when
   * this is set.
   */
  editDelegate?: {
    provider: string;
    model: string;
  };
  /**
   * Delegate serving text-to-video, when the endpoint behind {@link delegate}
   * animates an existing frame. Same split as {@link editDelegate}: a curated
   * clip model claims `text_to_video` only when this is set.
   */
  textDelegate?: {
    provider: string;
    model: string;
  };
  /** Selectable voices, for `tts` entries. */
  voices?: readonly NodetoolVoiceDef[];
}

export type NodetoolModelKind = "language" | "image" | "video" | "tts";

export const NODETOOL_PROVIDER_ID = "nodetool";

export const NODETOOL_MODELS: readonly NodetoolModelDef[] = [
  {
    id: "nodetool/director",
    name: "NodeTool Director",
    kind: "language",
    blurb: "Writes and directs. Not user-selectable.",
    delegate: { provider: "anthropic", model: "claude-sonnet-5" }
  },
  {
    id: "nodetool/flux-schnell",
    name: "Fast",
    kind: "image",
    blurb: "Cheapest stills, seconds per shot. Text prompts only.",
    tasks: ["text_to_image"],
    delegate: { provider: "fal_ai", model: "fal-ai/flux-1/schnell" }
  },
  {
    id: "nodetool/nano-banana",
    name: "Balanced",
    kind: "image",
    blurb: "Sharper stills, and it can work from your reference images.",
    tasks: ["text_to_image", "image_to_image"],
    delegate: { provider: "fal_ai", model: "fal-ai/nano-banana" },
    editDelegate: { provider: "fal_ai", model: "fal-ai/nano-banana/edit" }
  },
  {
    id: "nodetool/seedream",
    name: "Detailed",
    kind: "image",
    blurb: "Most detail per still, and the slowest of the three.",
    tasks: ["text_to_image", "image_to_image"],
    delegate: {
      provider: "fal_ai",
      model: "fal-ai/bytedance/seedream/v4/text-to-image"
    },
    editDelegate: {
      provider: "fal_ai",
      model: "fal-ai/bytedance/seedream/v4/edit"
    }
  },
  {
    id: "nodetool/hailuo-fast",
    name: "Fast",
    kind: "video",
    blurb: "Cheapest clips, good for blocking out a cut.",
    tasks: ["image_to_video", "text_to_video"],
    delegate: {
      provider: "fal_ai",
      model: "fal-ai/minimax/hailuo-02-fast/image-to-video"
    },
    textDelegate: {
      provider: "fal_ai",
      model: "fal-ai/minimax/hailuo-02/pro/text-to-video"
    }
  },
  {
    id: "nodetool/kling-turbo",
    name: "Balanced",
    kind: "video",
    blurb: "Steadier motion at half the price of the best tier.",
    tasks: ["image_to_video", "text_to_video"],
    delegate: {
      provider: "fal_ai",
      model: "fal-ai/kling-video/v2.5-turbo/standard/image-to-video"
    },
    textDelegate: {
      provider: "fal_ai",
      model: "fal-ai/kling-video/v3/turbo/standard/text-to-video"
    }
  },
  {
    id: "nodetool/kling-standard",
    name: "Best",
    kind: "video",
    blurb: "Most faithful motion, for the shots that carry the film.",
    tasks: ["image_to_video", "text_to_video"],
    delegate: {
      provider: "fal_ai",
      model: "fal-ai/kling-video/o1/standard/image-to-video"
    },
    textDelegate: {
      provider: "fal_ai",
      model: "fal-ai/kling-video/o3/standard/text-to-video"
    }
  },
  {
    id: "nodetool/kokoro",
    name: "NodeTool Voice",
    kind: "tts",
    blurb: "Eight voices for reading a script aloud.",
    tasks: ["text_to_speech"],
    delegate: { provider: "fal_ai", model: "fal-ai/kokoro" },
    voices: [
      { id: "af_heart", name: "Ada — warm, female" },
      { id: "af_nova", name: "Nova — bright, female" },
      { id: "af_sky", name: "Sky — soft, female" },
      { id: "am_michael", name: "Michael — warm, male" },
      { id: "am_echo", name: "Echo — even, male" },
      { id: "am_fenrir", name: "Fenrir — deep, male" },
      { id: "af_bella", name: "Bella — rich, female" },
      { id: "am_puck", name: "Puck — playful, male" }
    ]
  }
] as const;

export const nodetoolModelById = (id: string): NodetoolModelDef | null =>
  NODETOOL_MODELS.find((m) => m.id === id) ?? null;

/** The curated entries of one kind, in menu order. */
export const nodetoolModelsOfKind = (
  kind: NodetoolModelKind
): NodetoolModelDef[] => NODETOOL_MODELS.filter((m) => m.kind === kind);

/**
 * The delegate behind a nodetool model id, or null for an unknown id. Pass
 * `"image_to_image"` or `"text_to_video"` to get the endpoint the entry names
 * for that task, when it names one.
 */
export const resolveNodetoolDelegate = (
  id: string,
  task?: string
): { provider: string; model: string } | null => {
  const def = nodetoolModelById(id);
  if (!def) return null;
  if (task === "image_to_image" && def.editDelegate) return def.editDelegate;
  if (task === "text_to_video" && def.textDelegate) return def.textDelegate;
  return def.delegate;
};
