import { useCallback } from "react";
import { Asset } from "../../stores/ApiTypes";
import { useContextMenuActions } from "../../stores/ContextMenuStore";
import {
  useAssetGridStore,
  useAssetGridStoreApi
} from "../../stores/AssetGridStore";
import { useShallow } from "zustand/react/shallow";
import { serializeDragData, createAssetDragImage } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";

export const useAssetActions = (asset: Asset) => {
  const { openContextMenu } = useContextMenuActions();
  const gridStore = useAssetGridStoreApi();
  const {
    selectedAssetIds,
    setSelectedAssetIds,
    setSelectedAssets,
    setDeleteDialogOpen
  } = useAssetGridStore(
    useShallow((state) => ({
      selectedAssetIds: state.selectedAssetIds,
      setSelectedAssetIds: state.setSelectedAssetIds,
      setSelectedAssets: state.setSelectedAssets,
      setDeleteDialogOpen: state.setDeleteDialogOpen
    }))
  );

  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);

  const handleDrag = useCallback(
    (e: React.DragEvent) => {
      let assetIds;

      if (selectedAssetIds && selectedAssetIds.includes(asset.id)) {
        assetIds = selectedAssetIds;
      } else {
        assetIds = [asset.id];
        setSelectedAssetIds(assetIds);
      }

      if (assetIds.length === 1) {
        serializeDragData(
          {
            type: "asset",
            payload: asset,
            metadata: { sourceId: asset.id }
          },
          e.dataTransfer
        );
      } else {
        const allSelectedAssets =
          gridStore.getState().selectedAssets || [];
        const assetsById = new Map(
          [...allSelectedAssets, asset].map((a) => [a.id, a])
        );
        const resolvedAssets = assetIds
          .map((id) => assetsById.get(id))
          .filter((a): a is Asset => a !== undefined);
        serializeDragData(
          {
            type: "assets-multiple",
            payload: assetIds,
            metadata: {
              count: assetIds.length,
              sourceId: asset.id,
              assets: resolvedAssets
            }
          },
          e.dataTransfer
        );
      }

      // Also set legacy single asset key for components that only check "asset"
      // Note: serializeDragData sets "selectedAssetIds" but some code may only check "asset"
      e.dataTransfer.setData("asset", JSON.stringify(asset));

      const allSelectedAssets = gridStore.getState().selectedAssets || [];
      const dragImage = createAssetDragImage(
        asset,
        assetIds.length,
        allSelectedAssets
      );

      document.body.appendChild(dragImage);
      e.dataTransfer.setDragImage(dragImage, 10, 10);
      setTimeout(() => document.body.removeChild(dragImage), 0);

      setActiveDrag({
        type: "assets-multiple",
        payload: assetIds,
        metadata: { count: assetIds.length, sourceId: asset.id }
      });
    },
    [selectedAssetIds, setSelectedAssetIds, asset, setActiveDrag, gridStore]
  );

  const handleDragEnd = useCallback(() => {
    clearDrag();
  }, [clearDrag]);

  const handleContextMenu = useCallback(
    (event: React.MouseEvent, enableContextMenu: boolean) => {
      event.preventDefault();
      event.stopPropagation();
      if (enableContextMenu) {
        if (!selectedAssetIds.includes(asset.id)) {
          setSelectedAssetIds([asset.id]);
          setSelectedAssets([asset]);
        }

        openContextMenu(
          "asset-item-context-menu",
          asset.id,
          event.clientX,
          event.clientY
        );
      }
    },
    [asset, selectedAssetIds, openContextMenu, setSelectedAssetIds, setSelectedAssets]
  );

  const handleDelete = useCallback(() => {
    const isAssetAlreadySelected =
      selectedAssetIds?.includes(asset.id) ?? false;

    if (!isAssetAlreadySelected) {
      // Match context menu behavior: if the clicked item isn't in the selection,
      // replace the selection with just this item before opening the dialog
      setSelectedAssetIds([asset.id]);
      setSelectedAssets([asset]);
    }
    setDeleteDialogOpen(true);
  }, [
    selectedAssetIds,
    setDeleteDialogOpen,
    setSelectedAssetIds,
    setSelectedAssets,
    asset
  ]);

  return {
    handleDrag,
    handleDragEnd,
    handleContextMenu,
    handleDelete
  };
};
