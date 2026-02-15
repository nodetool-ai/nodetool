import log from "loglevel";
import { Asset } from "./ApiTypes";
import useResultsStore from "./ResultsStore";
import { useWorkflowAssetStore } from "./WorkflowAssetStore";

const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/ogg": ".ogg",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "application/pdf": ".pdf",
  "model/gltf-binary": ".glb",
  "model/gltf+json": ".gltf"
};

const normalizeMimeType = (contentType: string): string =>
  contentType.toLowerCase().split(";")[0].trim();

const getAssetExtension = (asset: Asset): string => {
  const dotIndex = asset.name.lastIndexOf(".");
  if (dotIndex >= 0 && dotIndex < asset.name.length - 1) {
    const ext = asset.name.slice(dotIndex);
    if (/^\.[a-z0-9]+$/i.test(ext)) {
      return ext.toLowerCase();
    }
  }

  const normalized = normalizeMimeType(asset.content_type);
  if (MIME_EXTENSION_MAP[normalized]) {
    return MIME_EXTENSION_MAP[normalized];
  }

  return "";
};

export const assetToResultValue = (asset: Asset): Record<string, unknown> => {
  const normalized = normalizeMimeType(asset.content_type);
  const extension = getAssetExtension(asset);
  const uri = `asset://${asset.id}${extension}`;
  const metadata = asset.metadata ?? undefined;

  if (normalized.startsWith("image/")) {
    return { type: "image", uri, asset_id: asset.id, metadata };
  }

  if (normalized.startsWith("audio/")) {
    return { type: "audio", uri, asset_id: asset.id, metadata };
  }

  if (normalized.startsWith("video/")) {
    return {
      type: "video",
      uri,
      asset_id: asset.id,
      metadata,
      duration: asset.duration ?? undefined
    };
  }

  if (normalized.startsWith("model/")) {
    return {
      type: "model_3d",
      uri,
      asset_id: asset.id,
      metadata,
      format: extension ? extension.slice(1) : undefined
    };
  }

  if (normalized === "application/pdf" || normalized.startsWith("text/")) {
    return { type: "document", uri, asset_id: asset.id, metadata };
  }

  return { type: "asset", uri, asset_id: asset.id, metadata };
};

export const groupWorkflowAssetsByNodeResult = (
  assets: Asset[]
): Record<string, unknown[]> => {
  const byNode: Record<string, unknown[]> = {};

  const sorted = [...assets]
    .filter((asset) => !!asset.node_id)
    .sort((a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      if (aTime !== bTime) {
        return aTime - bTime;
      }
      return a.id.localeCompare(b.id);
    });

  for (const asset of sorted) {
    const nodeId = asset.node_id as string;
    if (!byNode[nodeId]) {
      byNode[nodeId] = [];
    }
    byNode[nodeId].push(assetToResultValue(asset));
  }

  return byNode;
};

export const hydrateWorkflowResultsFromAssets = async (
  workflowId: string
): Promise<void> => {
  try {
    const assets = await useWorkflowAssetStore
      .getState()
      .loadWorkflowAssets(workflowId);
    const grouped = groupWorkflowAssetsByNodeResult(assets);
    const setOutputResult = useResultsStore.getState().setOutputResult;

    Object.entries(grouped).forEach(([nodeId, nodeResults]) => {
      const value = nodeResults.length === 1 ? nodeResults[0] : nodeResults;
      setOutputResult(workflowId, nodeId, value);
    });
  } catch (error) {
    log.warn(
      `[workflowResultHydration] Failed to hydrate workflow ${workflowId} from assets`,
      error
    );
  }
};

