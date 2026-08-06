/**
 * The curated catalog behind the `nodetool` provider — NodeTool's own managed
 * models. Each entry names the delegate that actually serves it; the provider
 * runs the delegate on platform-owned keys and the spend is metered against
 * the user's credit balance. BYOK providers are untouched by any of this.
 *
 * Pure data on purpose: the runtime provider routes with it, model-pricing
 * translates ids through it, and the web curated-model config points at it.
 */

export interface NodetoolModelDef {
  /** Public model id under the `nodetool` provider, e.g. "nodetool/flux-schnell". */
  id: string;
  name: string;
  kind: "language" | "image" | "video";
  /** Image/video task hints for the pickers. */
  tasks?: string[];
  delegate: {
    provider: string;
    model: string;
  };
}

export const NODETOOL_PROVIDER_ID = "nodetool";

export const NODETOOL_MODELS: readonly NodetoolModelDef[] = [
  {
    id: "nodetool/director",
    name: "NodeTool Director",
    kind: "language",
    delegate: { provider: "anthropic", model: "claude-sonnet-5" }
  },
  {
    id: "nodetool/flux-schnell",
    name: "NodeTool Still (FLUX Schnell)",
    kind: "image",
    tasks: ["text_to_image", "image_to_image"],
    delegate: { provider: "fal_ai", model: "fal-ai/flux-1/schnell" }
  },
  {
    id: "nodetool/kling-standard",
    name: "NodeTool Clip (Kling Standard)",
    kind: "video",
    tasks: ["image_to_video"],
    delegate: {
      provider: "fal_ai",
      model: "fal-ai/kling-video/o1/standard/image-to-video"
    }
  }
] as const;

export const nodetoolModelById = (id: string): NodetoolModelDef | null =>
  NODETOOL_MODELS.find((m) => m.id === id) ?? null;

/** The delegate behind a nodetool model id, or null for an unknown id. */
export const resolveNodetoolDelegate = (
  id: string
): { provider: string; model: string } | null =>
  nodetoolModelById(id)?.delegate ?? null;
