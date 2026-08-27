/**
 * Asset-library tools — let an agent discover and reuse the assets it (or the
 * user) has produced, across all media types.
 *
 * `list_images` / `view_image` already cover the image-viewing path; these
 * tools broaden discovery to every content type (images, video, audio,
 * documents) so an agent working a creative project can find a video it
 * rendered two turns ago, or the logo it generated, and reference it again —
 * on its own or by recording it in memory (memory_save).
 *
 * Both return lightweight handles (id, name, content_type, size, asset:// uri)
 * — no bytes are loaded. Use view_image to see image pixels.
 *
 * The implementations live in the `assets` capability module
 * (`../capabilities/assets.ts`); this module keeps the names and the getter.
 */

import { toolForCapabilityName } from "../capabilities/lazy-tool.js";
import type { Tool } from "./base-tool.js";

/** Names of the asset-library tools. */
export const ASSET_LIBRARY_TOOL_NAMES = ["asset_search", "asset_list"] as const;

/** Fresh instances of the asset-library tools. */
export function getAssetLibraryTools(): Tool[] {
  return ASSET_LIBRARY_TOOL_NAMES.map((name) => toolForCapabilityName(name));
}
