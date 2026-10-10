import React, { Suspense, useCallback, useMemo, useState } from "react";

import { FlexColumn, LoadingSpinner } from "../ui_primitives";
import LazyModel3DViewer from "../asset_viewer/LazyModel3DViewer";
import { isEditableModel3DAsset } from "../model_editor/isEditableModel3D";
import { useAssetById } from "../../serverState/useAssetById";
import { useAssetStore } from "../../stores/AssetStore";
import { useDocumentDraftStore } from "../../stores/DocumentDraftStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  tabId,
  useWorkspaceTabsStore,
  type WorkspaceTabMode
} from "../../stores/WorkspaceTabsStore";
import { BASE_URL } from "../../stores/BASE_URL";

import DocumentLoadStatus from "./DocumentLoadStatus";

const Model3DEditor = React.lazy(() => import("../model_editor/Model3DEditor"));

interface Model3DSurfaceProps {
  refId: string;
  mode: WorkspaceTabMode;
  active: boolean;
}

/**
 * Normalize an API media URL for the three.js loaders. Relative paths
 * (e.g. /api/assets/...) need the API origin when VITE_API_URL is set;
 * absolute/data/blob URLs pass through. Mirrors AssetEditor's resolver.
 */
const resolveMediaUrl = (url: string | null | undefined): string | null => {
  if (url == null) {
    return null;
  }
  const trimmed = url.trim();
  if (trimmed === "") {
    return null;
  }
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:")
  ) {
    return trimmed;
  }
  if (trimmed.startsWith("/")) {
    return `${BASE_URL}${trimmed}`;
  }
  return trimmed;
};

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

/**
 * The URL the editor loads, fixed for as long as the editor stays open on
 * one asset. Cloud storage signs a new `get_url` on every asset fetch, and the
 * asset is refetched after each save and on window focus. Passing each new
 * URL through would reload the editor and drop its unsaved edits and history.
 */
const usePinnedUrl = (key: string | null, url: string | null): string | null => {
  const [pinned, setPinned] = useState<{ key: string; url: string } | null>(null);
  if (key === null || url === null) {
    if (key === null && pinned !== null) {
      setPinned(null);
    }
    return null;
  }
  if (pinned?.key !== key) {
    setPinned({ key, url });
    return url;
  }
  return pinned.url;
};

/**
 * Workspace surface for a 3D model asset tab. `refId` is the Asset id.
 *
 * In "edit" mode it mounts the real Model3DEditor (lazily) when the asset is an
 * editable .glb/.gltf with a resolvable download URL, persisting saved blobs
 * back to the asset. For "view" mode — or any model the editor can't open — it
 * falls back to the lazy 3D viewer. Mirrors how AssetEditor wires Model3DEditor,
 * but loads the asset here and passes data down so no editor edits are needed.
 */
const Model3DSurface = ({ refId, mode, active }: Model3DSurfaceProps) => {
  const { data: asset, isPending, refetch } = useAssetById(refId);

  const updateAsset = useAssetStore((state) => state.update);
  const invalidateQueries = useAssetStore((state) => state.invalidateQueries);
  const setMode = useWorkspaceTabsStore((state) => state.setMode);

  const editorUrl = useMemo(() => {
    if (!asset || !isEditableModel3DAsset(asset)) {
      return null;
    }
    return resolveMediaUrl(asset.get_url);
  }, [asset]);
  const pinnedEditorUrl = usePinnedUrl(
    mode === "edit" && asset ? asset.id : null,
    editorUrl
  );

  // Publish unsaved edits so closing the tab or the window asks first.
  const documentTabId = tabId("model3d", refId);
  const handleDirtyChange = useCallback(
    (dirty: boolean) => useDocumentDraftStore.getState().setDirty(documentTabId, dirty),
    [documentTabId]
  );
  const persistBlob = useCallback(
    async (blob: Blob) => {
      if (!asset) {
        throw new Error("Asset is not loaded.");
      }
      const drafts = useDocumentDraftStore.getState();
      drafts.setSaving(documentTabId, true);
      try {
        const base64Data = await blobToBase64(blob);
        await updateAsset({
          id: asset.id,
          data: base64Data,
          data_encoding: "base64",
          content_type: "model/gltf-binary"
        });
      } finally {
        drafts.setSaving(documentTabId, false);
      }
      invalidateQueries(["asset", asset.id]);
      if (asset.parent_id) {
        invalidateQueries(["assets", { parent_id: asset.parent_id }]);
      }
      useNotificationStore.getState().addNotification({
        type: "success",
        content: `Saved ${asset.name || "3D model"}.`
      });
    },
    [asset, updateAsset, invalidateQueries, documentTabId]
  );

  const handleClose = useCallback(() => {
    setMode(tabId("model3d", refId), "view");
  }, [setMode, refId]);

  if (!asset) {
    return (
      <DocumentLoadStatus
        state={isPending ? "loading" : "error"}
        label="3D asset"
        onRetry={() => { void refetch(); }}
        onClose={() => useWorkspaceTabsStore.getState().closeTab(tabId("model3d", refId))}
      />
    );
  }

  if (mode === "edit" && pinnedEditorUrl) {
    return (
      <Suspense
        fallback={
          <FlexColumn
            fullWidth
            fullHeight
            sx={{ alignItems: "center", justifyContent: "center" }}
          >
            <LoadingSpinner />
          </FlexColumn>
        }
      >
        <Model3DEditor
          url={pinnedEditorUrl}
          name={asset.name}
          onSave={persistBlob}
          onClose={handleClose}
          active={active}
          onDirtyChange={handleDirtyChange}
        />
      </Suspense>
    );
  }

  return <LazyModel3DViewer asset={asset} />;
};

export default Model3DSurface;
