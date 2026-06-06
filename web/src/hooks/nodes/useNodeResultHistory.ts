/**
 * useNodeResultHistory — DB-backed generation history for a node.
 *
 * Single source of truth: the assets table. Generative nodes (those with
 * `auto_save_asset` in their metadata) write their outputs as assets on
 * job completion, each tagged with `node_id` and `job_id`.
 *
 * The hook surfaces two views:
 *   - `assetHistory` — every saved asset for this node across all runs.
 *   - `lastJobAssets` — only assets from the most recent job, used as a
 *     fallback when the live in-memory `outputResults` are gone (after a
 *     page reload or workflow switch). Cards always reflect the last
 *     workflow execution.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { trpcClient } from "../../trpc/client";
import type { Asset } from "../../stores/ApiTypes";
import { normalizeAssetList } from "../../utils/normalizeAsset";

const EMPTY_ASSETS: Asset[] = [];

const fetchNodeAssets = async (nodeId: string): Promise<Asset[]> => {
  const data = await trpcClient.assets.list.query({ node_id: nodeId });
  return normalizeAssetList((data.assets as Asset[]) ?? []);
};

export const nodeAssetsQueryKey = (nodeId: string | null) =>
  ["assets", { node_id: nodeId }] as const;

/**
 * Convert a saved asset into the value shape the preview components expect
 * (mirrors the `{ type, uri }` records carried over `output_update`).
 */
export const assetToOutputValue = (asset: Asset): Record<string, unknown> => {
  const ct = asset.content_type ?? "";
  const uri = asset.get_url ?? asset.thumb_url ?? "";
  if (ct.startsWith("image/")) return { type: "image", uri };
  if (ct.startsWith("video/")) return { type: "video", uri };
  if (ct.startsWith("audio/")) return { type: "audio", uri };
  if (ct.includes("model") || asset.name?.toLowerCase().endsWith(".glb")) {
    return { type: "model_3d", uri, name: asset.name ?? undefined };
  }
  return { uri, type: "asset", name: asset.name ?? undefined };
};

/**
 * Reduce a list of last-job assets to a single preview value (single asset)
 * or an array (multi-asset job). Returns `undefined` for an empty list so
 * callers can use it as a `??` fallback against live results.
 */
export const assetsToPreviewValue = (assets: Asset[]): unknown => {
  if (assets.length === 0) return undefined;
  const values = assets.map(assetToOutputValue);
  return values.length === 1 ? values[0] : values;
};

export const useNodeResultHistory = (
  workflowId: string | null,
  nodeId: string | null
) => {
  const enabled = Boolean(nodeId);
  const query = useQuery({
    queryKey: nodeAssetsQueryKey(nodeId),
    queryFn: () =>
      nodeId ? fetchNodeAssets(nodeId) : Promise.resolve(EMPTY_ASSETS),
    enabled,
    staleTime: 60_000
  });

  const assets = query.data ?? EMPTY_ASSETS;

  // Newest-first so badge/dialog/last-job derivations agree.
  const sortedAssets = useMemo(() => {
    if (assets.length < 2) return assets;
    return [...assets].sort((a, b) => {
      const aTs = a.created_at ? Date.parse(a.created_at) : 0;
      const bTs = b.created_at ? Date.parse(b.created_at) : 0;
      return bTs - aTs;
    });
  }, [assets]);

  // Group by job_id and pick the assets from the most recent group. Assets
  // without a job_id are treated as their own "last group" only when there
  // are no jobbed assets at all — otherwise they're ignored.
  const lastJobAssets = useMemo<Asset[]>(() => {
    if (sortedAssets.length === 0) return EMPTY_ASSETS;
    const jobbed = sortedAssets.filter((a) => a.job_id);
    if (jobbed.length === 0) return sortedAssets;
    const latestJobId = jobbed[0].job_id;
    return sortedAssets.filter((a) => a.job_id === latestJobId);
  }, [sortedAssets]);

  const lastJobId = lastJobAssets[0]?.job_id ?? null;

  return {
    assetHistory: sortedAssets,
    historyCount: sortedAssets.length,
    lastJobAssets,
    lastJobId,
    isLoading: query.isLoading,
    refresh: query.refetch,
    workflowId
  };
};

export default useNodeResultHistory;
