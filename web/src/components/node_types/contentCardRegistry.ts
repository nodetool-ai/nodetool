/**
 * Content-Card Registry
 *
 * Opt-in list of node types that render as a `ContentCardBody` instead of
 * the generic input/output layout. Membership is permanent — this is how
 * nodes declare "I am a content-forward node (image, video, text, etc.)",
 * not a transitional flag.
 *
 * Utility nodes (`If`, `Loop`, `Map`, control-flow, constants) stay on the
 * generic body forever and intentionally do not appear here.
 *
 * Initial seed (per plan §6.4): 3 image-generator nodes for validation.
 * Expansion happens in PR 6 once the scaffold has soaked.
 */

import type { NodeMetadata, OutputSlot } from "../../stores/ApiTypes";

export const CONTENT_CARD_REGISTRY: ReadonlySet<string> = new Set([
  "openai.image.CreateImage",
  "openai.image.EditImage",
  "nodetool.image.TextToImage"
]);

export const isContentCardNode = (nodeType: string | undefined): boolean =>
  !!nodeType && CONTENT_CARD_REGISTRY.has(nodeType);

/**
 * Per-variant default card dimensions applied at node creation time
 * (plan §6.3). Resolved from the node's primary output via
 * `getContentCardDefaultSize`. Single source of truth for content-card sizes.
 */
export const CONTENT_CARD_SIZES = {
  image: { width: 280, height: 280 },
  image_mask: { width: 280, height: 280 },
  video: { width: 320, height: 220 },
  text: { width: 320, height: 200 },
  audio: { width: 320, height: 120 },
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
 * audio / 3d / mask / generic). PR 4 only implements the `image` variant —
 * other variants land in PR 5.
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
