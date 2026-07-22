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
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Asset } from "@nodetool-ai/models";
import { Tool } from "./base-tool.js";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/** Build the canonical `asset://<id>.<ext>` uri for an asset. */
function assetUri(asset: Asset): string {
  const ext = asset.fileExtension;
  return ext ? `asset://${asset.id}.${ext}` : `asset://${asset.id}`;
}

function toHandle(asset: Asset): Record<string, unknown> {
  const metadata = (asset.metadata ?? {}) as Record<string, unknown>;
  return {
    asset_id: asset.id,
    name: asset.name,
    content_type: asset.content_type,
    uri: assetUri(asset),
    size: asset.size ?? null,
    duration: asset.duration ?? null,
    width: typeof metadata.width === "number" ? metadata.width : null,
    height: typeof metadata.height === "number" ? metadata.height : null,
    created_at: asset.created_at
  };
}

function resolveLimit(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0
    ? Math.min(Math.floor(n), MAX_LIMIT)
    : DEFAULT_LIMIT;
}

/** `asset_search` — find assets by name substring, optionally by media type. */
export class AssetSearchTool extends Tool {
  readonly name = "asset_search";
  readonly description =
    "Search the user's assets by name (case-insensitive substring), across " +
    "every media type, so you can find and reuse something already generated " +
    "or uploaded — a rendered video, a generated image, an audio clip. " +
    "Returns lightweight handles with asset:// uris. Filter by content_type " +
    "prefix (e.g. 'image/', 'video/', 'audio/').";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      query: {
        type: "string" as const,
        description: "Name substring to match. Empty matches everything (recent first)."
      },
      content_type: {
        type: "string" as const,
        description:
          "Optional MIME prefix filter (e.g. 'image/', 'video/', 'audio/', 'application/pdf')."
      },
      limit: {
        type: "number" as const,
        description: `Maximum results (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`
      }
    },
    required: [] as string[]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const userId = context.userId;
    if (!userId) return { success: false, error: "No user context; cannot search assets." };

    const query = typeof params.query === "string" ? params.query.trim() : "";
    const contentType =
      typeof params.content_type === "string" && params.content_type.trim()
        ? params.content_type.trim()
        : undefined;
    const limit = resolveLimit(params.limit);

    try {
      const [rows] = await Asset.searchAssetsGlobal(userId, query, {
        ...(contentType ? { contentType } : {}),
        limit
      });
      const assets = rows
        .filter((a) => a.content_type !== "folder")
        .map((a) => toHandle(a));
      return { success: true, count: assets.length, assets };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    const q = typeof params.query === "string" ? params.query : "";
    return q ? `Searching assets: ${q.slice(0, 50)}` : "Searching assets";
  }
}

/** `asset_list` — list recent assets, optionally filtered by media type. */
export class AssetListTool extends Tool {
  readonly name = "asset_list";
  readonly description =
    "List the user's most recent assets (newest first) so you can see and " +
    "reuse what has already been generated or uploaded. Filter by content_type " +
    "prefix (e.g. 'video/' for rendered videos). Returns handles with asset:// uris.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      content_type: {
        type: "string" as const,
        description:
          "Optional MIME prefix filter (e.g. 'image/', 'video/', 'audio/'). " +
          "Omit to list every type."
      },
      limit: {
        type: "number" as const,
        description: `Maximum results (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`
      }
    },
    required: [] as string[]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const userId = context.userId;
    if (!userId) return { success: false, error: "No user context; cannot list assets." };

    const contentType =
      typeof params.content_type === "string" && params.content_type.trim()
        ? params.content_type.trim()
        : undefined;
    const limit = resolveLimit(params.limit);

    try {
      // `searchAssetsGlobal` with an empty query orders by created_at DESC and
      // supports a content_type prefix — exactly a "recent assets" listing.
      const [rows] = await Asset.searchAssetsGlobal(userId, "", {
        ...(contentType ? { contentType } : {}),
        limit
      });
      const assets = rows
        .filter((a) => a.content_type !== "folder")
        .map((a) => toHandle(a));
      return { success: true, count: assets.length, assets };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    const ct = typeof params.content_type === "string" ? params.content_type : "";
    return ct ? `Listing ${ct} assets` : "Listing recent assets";
  }
}

/** Fresh instances of the asset-library tools. */
export function getAssetLibraryTools(): Tool[] {
  return [new AssetSearchTool(), new AssetListTool()];
}

/** Names of the asset-library tools. */
export const ASSET_LIBRARY_TOOL_NAMES = ["asset_search", "asset_list"] as const;
