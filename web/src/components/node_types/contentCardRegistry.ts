/**
 * Content-Card predicate.
 *
 * A node renders as a `ContentCardBody` (a content-forward
 * image/video/audio/3D/text body) instead of the generic input/output layout
 * iff its metadata declares `body: "content_card"`.
 *
 * This is the single source of truth — there is no namespace, name-pattern, or
 * allow-list matching. Node authors opt in from the backend:
 *   - Python nodes: set `_body = "content_card"` or override `body()` (often
 *     derived from the primary output type on a shared base class, e.g. the
 *     HuggingFace pipeline / replicate node bases).
 *   - TypeScript nodes: `static readonly body = "content_card"`, or set it on a
 *     shared base / node factory (e.g. the fal / kie / replicate generators
 *     derive it from the output type).
 *
 * The concrete variant (image/audio/video/text/3D) is still derived from the
 * primary output type by `getContentCardVariant` below.
 */

import type { NodeMetadata, OutputSlot } from "../../stores/ApiTypes";

/**
 * Decide whether a node should render as a content card.
 *
 * Driven entirely by `metadata.body`; there is no node_type matching.
 */
export const isContentCardNode = (
  metadata: NodeMetadata | undefined
): boolean => metadata?.body === "content_card";

/**
 * Per-variant default card dimensions applied at node creation time
 * (plan §6.3). Resolved from the node's primary output via
 * `getContentCardDefaultSize`. Single source of truth for content-card sizes.
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
 * Resolution order (plan §13.2 OQ-3):
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
  // names the kind (e.g. "image", "video", "str").
  const t = (output.type as { type?: string } | undefined)?.type ?? "";
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
 * created on the canvas (plan §6.3).
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
  "nodetool.data.Describe",
  "openai.agents.RealtimeAgent",
  "mistral.text.ChatComplete"
]);

/**
 * Human label for the `DynamicInputButton` shown in a content card.
 * Picked from primary-output variant — image generators say
 * "+ Add another image input", text/prompt nodes say "+ Add variable", etc.
 *
 * Plan §6.5: "+ Add another image input" (image-multi-input generators),
 * "+ Add another text input" (text concatenators), "+ Add variable"
 * (Prompt / template nodes).
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
