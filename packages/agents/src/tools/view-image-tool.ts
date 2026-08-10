/**
 * Lazy image viewing for agents.
 *
 * `ListImagesTool` lets the agent discover image assets as cheap handles (id,
 * name, type, size) without loading any pixels. `ViewImageTool` is the special
 * runtime primitive: given a handle it loads the pixels (optionally a cropped
 * region or a downscaled "low" detail view) and hands them back under
 * `image_content`. The agent tool loop recognizes that field and injects the
 * pixels into the model's next turn (see `image-injection.ts`), so the model
 * sees an image only after it asks for one — keeping the standing context cheap.
 *
 * Both are ported to the `assets` capability module
 * (`../capabilities/assets.ts`) and survive here as thin subclasses. They are
 * the two capabilities whose identity is a Zod schema, so each class keeps that
 * schema on `schema` and runs the *unvalidated* core: `Tool.execute` validates
 * once on the way in, exactly where it always did. The capability's own `impl`
 * carries the same check for callers that reach it through `invoke`.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  CapabilityTool,
  UNGATED,
  createCapabilityRun
} from "../capabilities/index.js";
import {
  LIST_IMAGES_SCHEMA,
  VIEW_IMAGE_SCHEMA,
  listImages,
  listImagesCore,
  viewImage,
  viewImageCore
} from "../capabilities/assets.js";

/** A run over one call's context. These tools take no injected dependency. */
function imageRun(context: ProcessingContext) {
  return createCapabilityRun({ context, gate: UNGATED });
}

/**
 * @deprecated Ported to the `assets` capability module
 * (`../capabilities/assets.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class ViewImageTool extends CapabilityTool {
  constructor() {
    super(viewImage.spec, viewImageCore, imageRun);
  }

  override get schema() {
    return VIEW_IMAGE_SCHEMA;
  }
}

/**
 * @deprecated Ported to the `assets` capability module
 * (`../capabilities/assets.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class ListImagesTool extends CapabilityTool {
  constructor() {
    super(listImages.spec, listImagesCore, imageRun);
  }

  override get schema() {
    return LIST_IMAGES_SCHEMA;
  }
}
