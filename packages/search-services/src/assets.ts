/**
 * Asset search over the library index, for the surfaces that answer with
 * asset rows: the `assets.search` procedure and the asset tools (D19).
 */

import { Asset } from "@nodetool-ai/models";
import type { SearchKind } from "@nodetool-ai/protocol";
import {
  searchLibrary,
  type LibrarySearchFilter,
  type LibrarySearchHit,
  type LibrarySearchRequest
} from "./query.js";

/** The kinds an asset row can be indexed as. */
export const ASSET_SEARCH_KINDS: readonly SearchKind[] = [
  "image",
  "video",
  "audio",
  "model_3d",
  "document",
  "entity",
  "file"
];

export interface AssetSearchOptions {
  projectId?: string;
  /** Content type prefix, such as `image/`. */
  contentType?: string;
  workflowId?: string;
  limit?: number;
  cursor?: string | null;
  filter?: Omit<LibrarySearchFilter, "contentType" | "workflowId">;
}

export interface AssetSearchResult {
  assets: Asset[];
  /** The folder each asset is shown under, by asset id. */
  folderPaths: Map<string, string | null>;
  /** Why each asset matched, by asset id. */
  hits: Map<string, LibrarySearchHit>;
  nextCursor: string | null;
  total: number;
}

/**
 * Search one owner's assets by name, prompt, description and tags. Matching
 * is case-insensitive on both dialects. Results are in rank order.
 */
export async function searchAssets(
  userId: string,
  query: string,
  options: AssetSearchOptions = {}
): Promise<AssetSearchResult> {
  const filter: LibrarySearchFilter = { ...options.filter };
  if (options.contentType) filter.contentType = options.contentType;
  if (options.workflowId) filter.workflowId = options.workflowId;
  const request: LibrarySearchRequest = {
    userId,
    query,
    kinds: ASSET_SEARCH_KINDS,
    filter,
    cursor: options.cursor ?? null
  };
  if (options.projectId !== undefined) request.projectId = options.projectId;
  if (options.limit !== undefined) request.limit = options.limit;
  const result = await searchLibrary(request);
  const ids = result.hits.map((hit) => hit.resourceId);
  const rows = new Map<string, Asset>();
  for (const asset of await Asset.findMany(userId, ids)) rows.set(asset.id, asset);
  const assets = ids.map((id) => rows.get(id)).filter((asset): asset is Asset => !!asset);
  return {
    assets,
    folderPaths: new Map(result.hits.map((hit) => [hit.resourceId, hit.folderPath])),
    hits: new Map(result.hits.map((hit) => [hit.resourceId, hit])),
    nextCursor: result.nextCursor,
    total: result.total
  };
}
