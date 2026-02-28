import { useCallback, useState } from "react";
import { Asset } from "../../stores/ApiTypes";
import useContextMenu from "../../stores/ContextMenuStore";
import { useAssetUpdate } from "../../serverState/useAssetUpdate";
import useAssets from "../../serverState/useAssets";
import log from "loglevel";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import {
  serializeDragData,
  deserializeDragData,
  createAssetDragImage
} from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";

export const useAssetActions = (asset: Asset) => {
  const [isDragHovered, setIsDragHovered] = useState(false);

  const { openContextMenu } = useContextMenu();
  const selectedAssetIds = useAssetGridStore((state) => state.selectedAssetIds);
  const setSelectedAssetIds = useAssetGridStore(
    (state) => state.setSelectedAssetIds
  );
  const setSelectedAssets = useAssetGridStore(
    (state) => state.setSelectedAssets
  );
  const setDeleteDialogOpen = useAssetGridStore(
    (state) => state.setDeleteDialogOpen
  );
  const setMoveToFolderDialogOpen = useAssetGridStore(
    (state) => state.setMoveToFolderDialogOpen
  );

  const { mutation: updateAssetMutation } = useAssetUpdate();
  const { refetchAssetsAndFolders } = useAssets();
  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);

  const handleClick = useCallback(
    (
      onSelect?: () => void,
      onClickParent?: (id: string) => void,
      isParent?: boolean
    ) => {
      if (isParent) {
        onClickParent?.(asset.id);
      }

      if (onSelect) {
        onSelect();
      }
    },
    [asset.id]
  );

  const handleDoubleClick = useCallback(
    (setOpenAsset?: (asset: Asset | undefined) => void) => {
      if (asset.get_url) {
        setOpenAsset?.(asset);
      }
    },
    [asset]
  );

  const handleDrag = useCallback(
    (e: React.DragEvent) => {
      let assetIds;

      if (selectedAssetIds && selectedAssetIds.includes(asset.id)) {
        assetIds = selectedAssetIds;
      } else {
        assetIds = [asset.id];
        setSelectedAssetIds(assetIds);
      }

      // Use unified drag serialization
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
        serializeDragData(
          {
            type: "assets-multiple",
            payload: assetIds,
            metadata: { count: assetIds.length, sourceId: asset.id }
          },
          e.dataTransfer
        );
      }

      // Also set legacy single asset key for components that only check "asset"
      // Note: serializeDragData sets "selectedAssetIds" but some code may only check "asset"
      e.dataTransfer.setData("asset", JSON.stringify(asset));

      // Create and set drag image using the unified utility
      // Try to get other selected assets from store for preview
      const allSelectedAssets =
        useAssetGridStore.getState().selectedAssets || [];
      const dragImage = createAssetDragImage(
        asset,
        assetIds.length,
        allSelectedAssets
      );

      document.body.appendChild(dragImage);
      e.dataTransfer.setDragImage(dragImage, 10, 10);
      setTimeout(() => document.body.removeChild(dragImage), 0);

      // Update global drag state
      setActiveDrag({
        type: "assets-multiple",
        payload: assetIds,
        metadata: { count: assetIds.length, sourceId: asset.id }
      });
    },
    [selectedAssetIds, setSelectedAssetIds, asset, setActiveDrag]
  );

  const handleDragEnd = useCallback(() => {
    clearDrag();
  }, [clearDrag]);

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
    },
    []
  );

  const handleDragEnter = useCallback(
    (_event: React.DragEvent<HTMLDivElement>) => {
      if (asset.content_type === "folder") {
        setIsDragHovered(true);
      }
    },
    [asset.content_type]
  );

  const handleDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node)) {
        setIsDragHovered(false);
      }
    },
    []
  );

  const handleDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragHovered(false);

      // Use unified deserialization
      const dragData = deserializeDragData(event.dataTransfer);
      if (!dragData) {
        log.error("Failed to deserialize drag data");
        return;
      }

      try {
        let assetIdsToMove: string[] = [];

        if (dragData.type === "assets-multiple") {
          assetIdsToMove = dragData.payload as string[];
        } else if (dragData.type === "asset") {
          assetIdsToMove = [(dragData.payload as Asset).id];
        }

        if (asset.content_type === "folder" && assetIdsToMove.length > 0) {
          await updateAssetMutation.mutateAsync(
            assetIdsToMove.map((id: string) => ({ id, parent_id: asset.id }))
          );
          setMoveToFolderDialogOpen(false);
          // Clear selection and refetch to update the UI
          setSelectedAssetIds([]);
          setSelectedAssets([]);
          refetchAssetsAndFolders();
        }
      } catch (_error) {
        log.error("Failed to process drop:", _error);
      }
    },
    [
      asset.content_type,
      asset.id,
      setMoveToFolderDialogOpen,
      updateAssetMutation,
      setSelectedAssetIds,
      setSelectedAssets,
      refetchAssetsAndFolders
    ]
  );

  const handleContextMenu = useCallback(
    (event: React.MouseEvent, enableContextMenu: boolean) => {
      event.preventDefault();
      event.stopPropagation();
      if (enableContextMenu) {
        if (
          // asset.content_type !== "folder" &&
          !selectedAssetIds.includes(asset.id)
        ) {
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
    isDragHovered,
    handleClick,
    handleDoubleClick,
    handleDrag,
    handleDragEnd,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handleContextMenu,
    handleDelete
  };
};
