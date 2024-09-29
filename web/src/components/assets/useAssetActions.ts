import { useCallback, useState } from "react";
import { Asset } from "../../stores/ApiTypes";
import useContextMenuStore from "../../stores/ContextMenuStore";
import { useAssetUpdate } from "../../serverState/useAssetUpdate";
import { devError } from "../../utils/DevLog";
import { useAssetGridStore } from "../../stores/AssetGridStore";

export const useAssetActions = (asset: Asset) => {
  const [isDragHovered, setIsDragHovered] = useState(false);

  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const selectedAssetIds = useAssetGridStore((state) => state.selectedAssetIds);
  const setSelectedAssetIds = useAssetGridStore(
    (state) => state.setSelectedAssetIds
  );
  const setDeleteDialogOpen = useAssetGridStore(
    (state) => state.setDeleteDialogOpen
  );
  const setMoveToFolderDialogOpen = useAssetGridStore(
    (state) => state.setMoveToFolderDialogOpen
  );

  const { mutation: updateAssetMutation } = useAssetUpdate();

  const handleClick = useCallback(
    (
      onSelect?: () => void,
      onClickParent?: (id: string) => void,
      isParent?: boolean
    ) => {
      if (isParent) {
        onClickParent && onClickParent(asset.id);
      }
      onSelect && onSelect();
    },
    [asset.id]
  );

  const handleDoubleClick = useCallback(
    (setOpenAsset?: (asset: Asset | undefined) => void) => {
      if (asset.get_url) {
        setOpenAsset && setOpenAsset(asset);
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

      e.dataTransfer.setData("selectedAssetIds", JSON.stringify(assetIds));
      e.dataTransfer.setData("asset", JSON.stringify(asset));

      const dragImage = document.createElement("div");
      dragImage.textContent = assetIds.length.toString();
      dragImage.style.cssText = `
      position: absolute;
      top: -99999px;
      background-color: #222;
      color: #999;
      border: 3px solid #333;
      border-radius: 4px;
      height: 40px;
      width: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      font-weight: bold;
    `;

      document.body.appendChild(dragImage);
      e.dataTransfer.setDragImage(dragImage, 25, 30);
      setTimeout(() => document.body.removeChild(dragImage), 0);
    },
    [selectedAssetIds, setSelectedAssetIds, asset]
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
    },
    []
  );

  const handleDragEnter = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
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
      const assetData = event.dataTransfer.getData("selectedAssetIds");
      setIsDragHovered(false);
      try {
        const selectedAssetIds = JSON.parse(assetData);
        if (asset.content_type === "folder") {
          await updateAssetMutation.mutateAsync(
            selectedAssetIds.map((id: string) => ({ id, parent_id: asset.id }))
          );
          setMoveToFolderDialogOpen(false);
        }
      } catch (error) {
        devError("Invalid JSON string:", assetData);
      }
    },
    [
      asset.content_type,
      asset.id,
      setMoveToFolderDialogOpen,
      updateAssetMutation
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
        }

        openContextMenu(
          "asset-item-context-menu",
          asset.id,
          event.clientX,
          event.clientY
        );
      }
    },
    [asset.id, selectedAssetIds, openContextMenu, setSelectedAssetIds]
  );

  const handleDelete = useCallback(() => {
    if (selectedAssetIds?.length === 0) {
      setSelectedAssetIds([asset.id]);
    }
    setDeleteDialogOpen(true);
  }, [
    selectedAssetIds?.length,
    setDeleteDialogOpen,
    setSelectedAssetIds,
    asset.id
  ]);

  return {
    isDragHovered,
    handleClick,
    handleDoubleClick,
    handleDrag,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handleContextMenu,
    handleDelete
  };
};
