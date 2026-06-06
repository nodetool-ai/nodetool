import { Asset } from "./ApiTypes";
import useResultsStore from "./ResultsStore";
import useWorkflowRunsStore from "./WorkflowRunsStore";
import { useWorkflowAssetStore } from "./WorkflowAssetStore";

/**
 * Synthetic job id for results hydrated from persisted assets on workflow open.
 * Results are keyed `${wf}:${jobId}:${node}`; hydration has no live run, so it
 * writes outputs under this id and focuses it ONLY when no real run exists,
 * letting the canvas display persisted outputs on a fresh open. A real run
 * (already present, or started later — which auto-focuses itself) always owns
 * the canvas, so hydration never freezes a live run's animations.
 */
export const HYDRATED_JOB_ID = "hydrated";

interface AssetResultBase {
  uri: string;
  asset_id: string;
  metadata?: Record<string, unknown>;
}

interface ImageResult extends AssetResultBase {
  type: "image";
}

interface AudioResult extends AssetResultBase {
  type: "audio";
}

interface VideoResult extends AssetResultBase {
  type: "video";
  duration?: number;
}

interface Model3DResult extends AssetResultBase {
  type: "model_3d";
  format?: string;
}

interface HtmlResult extends AssetResultBase {
  type: "html";
}

interface DocumentResult extends AssetResultBase {
  type: "document";
}

interface GenericAssetResult extends AssetResultBase {
  type: "asset";
}

export type AssetResultValue =
  | ImageResult
  | AudioResult
  | VideoResult
  | Model3DResult
  | HtmlResult
  | DocumentResult
  | GenericAssetResult;

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
  "text/html": ".html",
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

export const assetToResultValue = (asset: Asset): AssetResultValue => {
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

  if (normalized === "text/html") {
    return { type: "html", uri, asset_id: asset.id, metadata };
  }

  if (normalized === "application/pdf" || normalized.startsWith("text/")) {
    return { type: "document", uri, asset_id: asset.id, metadata };
  }

  return { type: "asset", uri, asset_id: asset.id, metadata };
};

export const groupWorkflowAssetsByNodeResult = (
  assets: Asset[]
): Record<string, AssetResultValue[]> => {
  const byNode: Record<string, AssetResultValue[]> = {};

  const sorted = [...assets]
    .filter((asset): asset is Asset & { node_id: string } => !!asset.node_id)
    .sort((a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      if (aTime !== bTime) {
        return aTime - bTime;
      }
      return a.id.localeCompare(b.id);
    });

  for (const asset of sorted) {
    const nodeId = asset.node_id;
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
    if (Object.keys(grouped).length === 0) {
      return;
    }

    const setOutputResult = useResultsStore.getState().setOutputResult;
    const runsStore = useWorkflowRunsStore.getState();

    // Write the persisted outputs under the synthetic "hydrated" run so the
    // focused-run readers can display them on open.
    for (const nodeId in grouped) {
      if (!Object.prototype.hasOwnProperty.call(grouped, nodeId)) {
        continue;
      }
      const nodeResults = grouped[nodeId];
      const value = nodeResults.length === 1 ? nodeResults[0] : nodeResults;
      setOutputResult(workflowId, HYDRATED_JOB_ID, nodeId, value);
    }

    // Only focus the hydrated bucket when there is no real run to show. This
    // hydration is async and can resolve AFTER the user has started or selected
    // a run; recording it would auto-focus it (latest-run-wins) and steal the
    // canvas away from a live run, freezing the animations. A real run started
    // later auto-focuses itself, superseding this on its own.
    const hasRealRun = runsStore
      .getRuns(workflowId)
      .some((run) => run.jobId !== HYDRATED_JOB_ID);
    if (!hasRealRun) {
      runsStore.recordRun({
        jobId: HYDRATED_JOB_ID,
        workflowId,
        state: "completed",
        startedAt: Date.now()
      });
    }
  } catch (error) {
    console.warn(
      `[workflowResultHydration] Failed to hydrate workflow ${workflowId} from assets`,
      error
    );
  }
};
