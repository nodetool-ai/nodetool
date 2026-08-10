/**
 * Asset-library tools — let an agent discover and reuse the assets it (or the
 * user) has produced, across all media types.
 *
 * `list_images` / `view_image` already cover the image-viewing path; these
 * tools broaden discovery to every content type (images, video, audio,
 * documents) so an agent working a creative project can find a video it
 * rendered two turns ago, or the logo it generated, and reference it again —
 * on its own or by recording it in thread memory (thread_memory_save).
 *
 * Both return lightweight handles (id, name, content_type, size, asset:// uri)
 * — no bytes are loaded. Use view_image to see image pixels.
 *
 * Both are ported to the `assets` capability module
 * (`../capabilities/assets.ts`) and survive here as thin subclasses.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  CapabilityTool,
  UNGATED,
  createCapabilityRun
} from "../capabilities/index.js";
import { assetList, assetSearch } from "../capabilities/assets.js";
import type { Tool } from "./base-tool.js";

/** A run over one call's context. These tools take no injected dependency. */
function assetRun(context: ProcessingContext) {
  return createCapabilityRun({ context, gate: UNGATED });
}

/**
 * `asset_search` — find assets by name substring, optionally by media type.
 *
 * @deprecated Ported to the `assets` capability module
 * (`../capabilities/assets.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class AssetSearchTool extends CapabilityTool {
  constructor() {
    super(assetSearch.spec, assetSearch.impl, assetRun);
  }
}

/**
 * `asset_list` — list recent assets, optionally filtered by media type.
 *
 * @deprecated Ported to the `assets` capability module
 * (`../capabilities/assets.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class AssetListTool extends CapabilityTool {
  constructor() {
    super(assetList.spec, assetList.impl, assetRun);
  }
}

/** Fresh instances of the asset-library tools. */
export function getAssetLibraryTools(): Tool[] {
  return [new AssetSearchTool(), new AssetListTool()];
}

/** Names of the asset-library tools. */
export const ASSET_LIBRARY_TOOL_NAMES = ["asset_search", "asset_list"] as const;
