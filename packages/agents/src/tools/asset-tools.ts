/**
 * Asset persistence for the agent system.
 *
 * Both tools are ported to the `assets` capability module
 * (`../capabilities/assets.ts`) and survive here as thin subclasses so their
 * constructors and wire identities keep working:
 *
 * - SaveAssetTool: Save text or binary (base64) content as an asset.
 *   Prefers `context.createAsset` (DB + storage, returns asset:// URI) and
 *   falls back to the lower-level storage adapter for plain text/key-value.
 * - ReadAssetTool: Read content from a stored asset file.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  CapabilityTool,
  UNGATED,
  createCapabilityRun
} from "../capabilities/index.js";
import { readAsset, saveAsset } from "../capabilities/assets.js";

/** A run over one call's context. These tools take no injected dependency. */
function assetRun(context: ProcessingContext) {
  return createCapabilityRun({ context, gate: UNGATED });
}

/**
 * @deprecated Ported to the `assets` capability module
 * (`../capabilities/assets.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class SaveAssetTool extends CapabilityTool {
  constructor() {
    super(saveAsset.spec, saveAsset.impl, assetRun);
  }
}

/**
 * @deprecated Ported to the `assets` capability module
 * (`../capabilities/assets.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class ReadAssetTool extends CapabilityTool {
  constructor() {
    super(readAsset.spec, readAsset.impl, assetRun);
  }
}
