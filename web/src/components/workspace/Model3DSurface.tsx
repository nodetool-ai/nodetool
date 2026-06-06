import React, { Suspense, useCallback, useMemo } from "react";

import { FlexColumn, LoadingSpinner } from "../ui_primitives";
import LazyModel3DViewer from "../asset_viewer/LazyModel3DViewer";
import { isEditableModel3DAsset } from "../model_editor/isEditableModel3D";
import { useAssetById } from "../../serverState/useAssetById";
import { useAssetStore } from "../../stores/AssetStore";
import {
  tabId,
  useWorkspaceTabsStore,
  type WorkspaceTabMode
} from "../../stores/WorkspaceTabsStore";
import { BASE_URL } from "../../stores/BASE_URL";

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
 * Workspace surface for a 3D model asset tab. `refId` is the Asset id.
 *
 * In "edit" mode it mounts the real Model3DEditor (lazily) when the asset is an
 * editable .glb/.gltf with a resolvable download URL, persisting saved blobs
 * back to the asset. For "view" mode — or any model the editor can't open — it
 * falls back to the lazy 3D viewer. Mirrors how AssetEditor wires Model3DEditor,
 * but loads the asset here and passes data down so no editor edits are needed.
 */
const Model3DSurface = ({ refId, mode }: Model3DSurfaceProps) => {
  const { data: asset, isLoading } = useAssetById(refId);

  const updateAsset = useAssetStore((state) => state.update);
  const invalidateQueries = useAssetStore((state) => state.invalidateQueries);
  const setMode = useWorkspaceTabsStore((state) => state.setMode);

  const editorUrl = useMemo(() => {
    if (!asset || !isEditableModel3DAsset(asset)) {
      return null;
    }
    return resolveMediaUrl(asset.get_url);
  }, [asset]);

  const persistBlob = useCallback(
    async (blob: Blob) => {
      if (!asset) {
        return;
      }
      const base64Data = await blobToBase64(blob);
      await updateAsset({
        id: asset.id,
        data: base64Data,
        data_encoding: "base64"
      });
      invalidateQueries(["asset", asset.id]);
      if (asset.parent_id) {
        invalidateQueries(["assets", { parent_id: asset.parent_id }]);
      }
    },
    [asset, updateAsset, invalidateQueries]
  );

  const handleClose = useCallback(() => {
    setMode(tabId("model3d", refId), "view");
  }, [setMode, refId]);

  if (isLoading || !asset) {
    return (
      <FlexColumn
        fullWidth
        fullHeight
        sx={{ alignItems: "center", justifyContent: "center" }}
      >
        <LoadingSpinner />
      </FlexColumn>
    );
  }

  if (mode === "edit" && editorUrl) {
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
          url={editorUrl}
          name={asset.name}
          onSave={persistBlob}
          onClose={handleClose}
        />
      </Suspense>
    );
  }

  return <LazyModel3DViewer asset={asset} />;
};

export default Model3DSurface;
