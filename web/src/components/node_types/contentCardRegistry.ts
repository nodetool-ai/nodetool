/**
 * Content-Card predicate.
 *
 * A node renders as a `ContentCardBody` (a content-forward
 * image/video/audio/3D/text body) instead of the generic input/output layout
 * when either:
 *   1. its metadata declares `body: "content_card"` (explicit opt-in, any
 *      output type), or
 *   2. its primary output is media (an image, a list of images, a mask, a
 *      video, audio or a 3D model). Every media-producing node gets the
 *      preview body, even without the backend opt-in, so a video Blur shows
 *      its result the way an image Blur does.
 *
 * Backend opt-in (case 1) covers text output (LLM and transcription nodes):
 *   - Python nodes: set `_body = "content_card"` or override `body()` (often
 *     derived from the primary output type on a shared base class, e.g. the
 *     HuggingFace pipeline / replicate node bases).
 *   - TypeScript nodes: `static readonly body = "content_card"`, or set it on a
 *     shared base / node factory (e.g. the fal / kie / replicate generators
 *     derive it from the output type).
 *
 * The concrete variant (image/audio/video/text/3D) is derived from the primary
 * output type by `getContentCardVariant` below.
 */

import type { NodeMetadata, OutputSlot } from "../../stores/ApiTypes";

/**
 * Decide whether a node should render as a content card.
 *
 * True when the backend opts in via `body: "content_card"`, or when the node's
 * primary output is media. Bespoke editing bodies still win in `NodeContent`
 * routing — for those this only ensures content-card sizing and overlay
 * behavior.
 */
export const isContentCardNode = (
  metadata: NodeMetadata | undefined
): boolean => {
  if (!metadata) {
    return false;
  }
  if (metadata.body === "content_card") {
    return true;
  }
  // Constant nodes already render their value via the result overlay
  // (`isConstantNode` in BaseNode) — e.g. `nodetool.constant.Image` shows its
  // image without a content card. Don't double up.
  if ((metadata.node_type ?? "").startsWith("nodetool.constant.")) {
    return false;
  }
  // Input nodes hold a value the user sets (the image dropzone, a file
  // picker), not one produced by a run. Render that editable value directly
  // rather than the content-card result preview.
  if ((metadata.node_type ?? "").startsWith("nodetool.input.")) {
    return false;
  }
  return MEDIA_VARIANTS.has(getContentCardVariant(getPrimaryOutput(metadata)));
};

const MEDIA_VARIANTS: ReadonlySet<ContentCardVariant> = new Set([
  "image",
  "image_mask",
  "video",
  "audio",
  "model_3d"
]);

/**
 * Per-variant default card dimensions applied at node creation time.
 * Resolved from the node's primary output via `getContentCardDefaultSize`.
 * Single source of truth for content-card sizes.
 */
// Heights are sized for the preview area only; prompt/text inputs now render
// as left-edge handles (see classifyFields), so we no longer pad for an inline
// editor row. Users can resize further; these are just the comfortable defaults.
export const CONTENT_CARD_SIZES = {
  image: { width: 280, height: 280 },
  image_mask: { width: 280, height: 280 },
  video: { width: 320, height: 220 },
  text: { width: 320, height: 220 },
  audio: { width: 320, height: 160 },
  model_3d: { width: 280, height: 280 },
  generic: { width: 280, height: 280 }
} as const;

/**
 * Pick the "primary" output for a ContentCardBody preview.
 *
 * Resolution order:
 *   1. If `metadata.primary_output` names an output, use it.
 *      (This is a forward-compatible optional field — backend node authors
 *       may set it; absent today.)
 *   2. Otherwise, the first entry in `metadata.outputs`.
 *
 * Returns `undefined` for nodes that declare no outputs.
 */
export const getPrimaryOutput = (
  metadata: NodeMetadata
): OutputSlot | undefined => {
  const outputs = metadata.outputs ?? [];
  if (outputs.length === 0) {
    return undefined;
  }
  const named = (metadata as { primary_output?: string }).primary_output;
  if (named) {
    const match = outputs.find((o) => o.name === named);
    if (match) {
      return match;
    }
  }
  return outputs[0];
};

/**
 * Coarse classification of a primary output's type into a body variant.
 * The variant drives which preview the body renders (image / video / text /
 * audio / 3d / mask / generic).
 */
export type ContentCardVariant =
  | "image"
  | "image_mask"
  | "video"
  | "text"
  | "audio"
  | "model_3d"
  | "generic";

export const getContentCardVariant = (
  output: OutputSlot | undefined
): ContentCardVariant => {
  if (!output) {
    return "generic";
  }
  // OutputSlot.type is a PropertyTypeMetadata; its top-level `type` string
  // names the kind (e.g. "image", "video", "str"). A list of images previews
  // as the image grid.
  const t = output.type.type;
  if (t === "list" && output.type.type_args?.[0]?.type === "image") {
    return "image";
  }
  switch (t) {
    case "image":
      return "image";
    case "image_mask":
    case "mask":
      return "image_mask";
    case "video":
      return "video";
    case "audio":
      return "audio";
    case "model_3d":
    case "asset_3d":
      return "model_3d";
    case "str":
    case "text":
      return "text";
    default:
      return "generic";
  }
};

/**
 * Default `{width, height}` for a content-card node, picked by the node's
 * primary-output variant. Used by `NodeStore` when a content-card node is
 * created on the canvas.
 */
export const getContentCardDefaultSize = (
  metadata: NodeMetadata
): { width: number; height: number } => {
  const variant = getContentCardVariant(getPrimaryOutput(metadata));
  return CONTENT_CARD_SIZES[variant];
};

/**
 * Prompt/template nodes that substitute `{{variables}}` — their dynamic-input
 * button reads "+ Add variable" instead of a media-input label.
 */
const PROMPT_TEMPLATE_NODES = new Set<string>([
  "nodetool.agents.Agent",
  "nodetool.agents.Summarizer",
  "nodetool.agents.Extractor",
  "nodetool.agents.Classifier",
  "nodetool.text.Concat",
  "openai.agents.RealtimeAgent",
  "mistral.text.ChatComplete"
]);

/**
 * Human label for the `DynamicInputButton` shown in a content card.
 * Picked from primary-output variant — image generators say
 * "+ Add another image input", text/prompt nodes say "+ Add variable", etc.
 */
export const getDynamicInputLabel = (metadata: NodeMetadata): string => {
  const t = metadata.node_type ?? "";
  // Template-style nodes use {{variable}} substitution — say "variable".
  if (PROMPT_TEMPLATE_NODES.has(t)) {
    return "variable";
  }
  const variant = getContentCardVariant(getPrimaryOutput(metadata));
  switch (variant) {
    case "image":
    case "image_mask":
      return "image input";
    case "video":
      return "video input";
    case "audio":
      return "audio input";
    case "model_3d":
      return "input";
    case "text":
      return "text input";
    default:
      return "input";
  }
};
