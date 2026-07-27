/**
 * Which output types render as a content card.
 *
 * A node whose primary output is one of these has something to *show* — an
 * image, a video, an audio waveform, a 3D model, or text. The editor renders
 * those with `ContentCardBody` (a preview-forward body) instead of the generic
 * input/output layout, driven by `body: "content_card"` in the node metadata.
 *
 * Provider packs derive the flag from their manifest rather than declaring it
 * per node, so a new model added to a manifest gets the right body for free.
 * Keep this list in sync with `getContentCardVariant` in
 * `web/src/components/node_types/contentCardRegistry.ts`, which maps the same
 * types onto the concrete preview variant.
 */
const CONTENT_CARD_OUTPUT_TYPES: ReadonlySet<string> = new Set([
  "image",
  "image_mask",
  "mask",
  "video",
  "audio",
  "model_3d",
  "asset_3d",
  "str",
  "text"
]);

import type { DeclaredOutputTypes } from "./base-node.js";

/** The parts of a node class this module reads and writes. */
interface ContentCardTarget {
  metadataOutputTypes?: DeclaredOutputTypes | undefined;
  outputTypes?: DeclaredOutputTypes;
  body?: string | undefined;
}

/** True when a node with this primary output type should render a content card. */
export function isContentCardOutputType(
  outputType: string | undefined
): boolean {
  return outputType !== undefined && CONTENT_CARD_OUTPUT_TYPES.has(outputType);
}

/**
 * Type of the output slot the editor previews — the one `getNodeMetadata`
 * puts at `outputs[0]`, so the resolution order matches it: an explicit
 * `metadataOutputTypes` map wins over `outputTypes`.
 */
export function primaryDeclaredOutputType(
  nodeClass: ContentCardTarget
): string | undefined {
  const declared = nodeClass.metadataOutputTypes ?? nodeClass.outputTypes ?? {};
  return Object.values(declared)[0];
}

/**
 * Stamp `body = "content_card"` on a generated node class whose primary output
 * is displayable. A class that already declares its own `body` keeps it —
 * per-node overrides win (e.g. the "small" voice-picker bodies).
 *
 * Call after the class's output types are defined.
 */
export function applyContentCardBody(nodeClass: ContentCardTarget): void {
  if (nodeClass.body !== undefined) {
    return;
  }
  if (!isContentCardOutputType(primaryDeclaredOutputType(nodeClass))) {
    return;
  }
  Object.defineProperty(nodeClass, "body", {
    value: "content_card",
    configurable: true
  });
}

/**
 * List form of {@link applyContentCardBody}, for hand-written node packs that
 * export a node array. Returns `classes` so it can wrap the array literal.
 */
export function tagContentCardBodies<T extends readonly ContentCardTarget[]>(
  classes: T
): T {
  for (const cls of classes) {
    applyContentCardBody(cls);
  }
  return classes;
}
