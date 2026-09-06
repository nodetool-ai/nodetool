/**
 * What the New Project composer was holding when the Image card was clicked
 * (F4): the reference images attached to the prompt and the entities picked
 * beside it.
 *
 * PRD § 6.1 carries only the typed prompt into step 1, and a reference image is
 * exactly the context an image flow should not lose — so the fields travel on
 * the document like every other setup field, optional and additive (PRD § 6.4).
 * A document written without them reads as a flow with no references, which is
 * every document made before this existed.
 *
 * `setup` passes unknown keys through, so both read back as `unknown` and are
 * narrowed here, once.
 */

import type { SketchSetup } from "@nodetool-ai/protocol/api-schemas/sketch.js";

/**
 * How many references travel. The composer accepts more; a setup document is
 * saved on every keystroke of the brief, so this is what it carries.
 */
export const MAX_IMAGE_REFERENCES = 3;

/** One attached picture, as the composer held it. */
export interface ImageReference {
  /**
   * `asset://<id>` for something dragged from the library, a `data:` URI for a
   * file dropped from disk. Both render, and both reach a provider — the
   * server resolves the first before it calls one.
   */
  uri: string;
  name: string;
  /** MIME type, e.g. `image/png`. */
  type: string;
}

const isReference = (value: unknown): value is ImageReference => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.uri === "string" &&
    record.uri.length > 0 &&
    typeof record.name === "string" &&
    typeof record.type === "string"
  );
};

/** The images the composer attached, or none. */
export const readReferences = (
  setup: SketchSetup | undefined
): ImageReference[] =>
  Array.isArray(setup?.references)
    ? setup.references.filter(isReference).slice(0, MAX_IMAGE_REFERENCES)
    : [];

/** The entities the composer had selected, or none. */
export const readEntityIds = (setup: SketchSetup | undefined): string[] =>
  Array.isArray(setup?.entity_ids)
    ? setup.entity_ids.filter(
        (id): id is string => typeof id === "string" && id.length > 0
      )
    : [];

/** Only images can be looked at, so only images reach the model. */
export const imageReferences = (
  references: readonly ImageReference[]
): ImageReference[] =>
  references.filter((reference) => reference.type.startsWith("image/"));
