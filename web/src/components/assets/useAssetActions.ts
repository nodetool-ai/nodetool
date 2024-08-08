import { useCallback, useState } from "react";
import { Asset } from "../../stores/ApiTypes";
import useSessionStateStore from "../../stores/SessionStateStore";
import useContextMenuStore from "../../stores/ContextMenuStore";
import { useAssetUpdate } from "../../serverState/useAssetUpdate";
import { devError } from "../../utils/DevLog";
import { useAssetDialog } from "../../hooks/assets/useAssetDialog";
import useAssets from "../../serverState/useAssets";
import { useAssetSelection } from "../../hooks/assets/useAssetSelection";

export const useAssetActions = (asset: Asset) => {
  const [isDragHovered, setIsDragHovered] = useState(false);
  const { refetch, isLoading } = useAssets();
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const selectedAssetIds = useSessionStateStore(
    (state) => state.selectedAssetIds
  );
  const setSelectedAssetIds = useSessionStateStore(
    (state) => state.setSelectedAssetIds
  );
  const { sortedAssets } = useAssets();
  const { handleSelectAsset } = useAssetSelection(sortedAssets);

  const { mutation: updateAssetMutation } = useAssetUpdate();

  const handleClick = useCallback(
    (asset: Asset) => {
      handleSelectAsset(asset.id);
    },
    [handleSelectAsset]
  );

  const handleDoubleClick = useCallback(
    (setOpenAsset?: (asset: Asset | undefined) => void) => {
      if (asset.get_url) {
        setOpenAsset && setOpenAsset(asset);
      }
    },
    [asset]
  );

  const onMoveToFolder = useCallback(() => {
    refetch();
    setSelectedAssetIds([]);
  }, [refetch, setSelectedAssetIds]);

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

      try {
        const selectedAssetIds = JSON.parse(assetData);
        if (asset.content_type === "folder") {
          await updateAssetMutation.mutateAsync(
            selectedAssetIds.map((id: string) => ({ id, parent_id: asset.id }))
          );
          onMoveToFolder && onMoveToFolder();
        }
      } catch (error) {
        devError("Invalid JSON string:", assetData);
      }
    },
    [asset.content_type, asset.id, updateAssetMutation, onMoveToFolder]
  );

  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!selectedAssetIds.includes(asset.id)) {
        setSelectedAssetIds([asset.id]);
      }

      openContextMenu(
        "asset-item-context-menu",
        asset.id,
        event.clientX,
        event.clientY
      );
    },
    [selectedAssetIds, setSelectedAssetIds, openContextMenu, asset.id]
  );

  const { openDeleteDialog, openRenameDialog } = useAssetDialog();

  const handleDelete = useCallback(() => {
    console.log("Delete asset", selectedAssetIds);
    if (selectedAssetIds?.length === 0) {
      console.log("Setting selectedAssetIds to:", [asset.id]);
      setSelectedAssetIds([asset.id]);
    }
    console.log("About to call openDeleteDialog");
    console.log("openDeleteDialog type:", typeof openDeleteDialog);
    try {
      openDeleteDialog();
      console.log("openDeleteDialog called successfully");
    } catch (error) {
      console.error("Error calling openDeleteDialog:", error);
    }
  }, [selectedAssetIds, setSelectedAssetIds, asset.id, openDeleteDialog]);

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
    handleDelete,
  };
};
