import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  AlertBanner,
  Dialog,
  FlexColumn,
  SPACING,
  TextInput
} from "../ui_primitives";
import { useAssetStore } from "../../stores/AssetStore";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import useAssets from "../../serverState/useAssets";
import { useNotificationStore } from "../../stores/NotificationStore";
import { Asset } from "../../stores/ApiTypes";

const AssetCreateFolderConfirmation: React.FC = () => {
  const setDialogOpen = useAssetGridStore(
    (state) => state.setCreateFolderDialogOpen
  );
  const dialogOpen = useAssetGridStore((state) => state.createFolderDialogOpen);
  const selectedAssetIds = useAssetGridStore((state) => state.selectedAssetIds);
  const currentFolder = useAssetGridStore((state) => state.currentFolder);
  const setSelectedAssetIds = useAssetGridStore(
    (state) => state.setSelectedAssetIds
  );
  const setSelectedAssets = useAssetGridStore(
    (state) => state.setSelectedAssets
  );
  const setFoldersVisible = useAssetGridStore(
    (state) => state.setFoldersVisible
  );

  const [folderName, setFolderName] = useState("New Folder");
  const [showAlert, setShowAlert] = useState<string | null>(null);
  const handleClose = useCallback(() => {
    setDialogOpen(false);
  }, [setDialogOpen]);
  const dismissAlert = useCallback(() => setShowAlert(null), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const createFolder = useAssetStore((state) => state.createFolder);
  const updateAsset = useAssetStore((state) => state.update);
  const { refetchAssetsAndFolders, folderFilesFiltered, projectId } =
    useAssets();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const assetMap = useMemo(() => {
    const map = new Map<string, Asset>();
    folderFilesFiltered.forEach((asset) => map.set(asset.id, asset));
    return map;
  }, [folderFilesFiltered]);

  const selectedAssets = useMemo(() => {
    if (selectedAssetIds.length === 0) {
      return [];
    }
    return selectedAssetIds
      .map((id) => assetMap.get(id))
      .filter((asset): asset is Asset => asset !== undefined);
  }, [selectedAssetIds, assetMap]);

  const isFolder = selectedAssets.some(
    (asset) => asset.content_type === "folder"
  );
  const hasSelectedAssets = selectedAssets.length > 0 && !isFolder;

  useEffect(() => {
    if (dialogOpen) {
      setFolderName("New Folder");
      setShowAlert(null);
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          // Typing replaces the default name instead of appending to it.
          inputRef.current.select();
        }
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [dialogOpen]);

  const handleCreateFolder = useCallback(async () => {
    const invalidCharsRegex = /[/*?"<>|#%{}^[\]`'=&$§!°äüö;+~|$!]+/g;

    function startsWithEmoji(fileName: string): boolean {
      const emojiRegex =
        /^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      return emojiRegex.test(fileName);
    }

    if (
      startsWithEmoji(folderName) ||
      folderName.startsWith(".") ||
      folderName.startsWith(",") ||
      folderName.startsWith(" ") ||
      folderName.match(/^[-#*&]/)
    ) {
      setShowAlert("Name cannot start with a special character.");
      return;
    }

    const invalidCharsFound = folderName.match(invalidCharsRegex);

    if (!folderName) {
      setShowAlert("Name cannot be empty.");
      return;
    } else if (folderName.length > 100) {
      setShowAlert("Max folder name length is 100 characters.");
      return;
    }

    if (invalidCharsFound) {
      const uniqueInvalidChars = invalidCharsFound.filter(
        (char, index, array) => array.indexOf(char) === index
      );
      setShowAlert(`Invalid characters: ${uniqueInvalidChars.join(", ")}`);
      return;
    }

    const cleanedName = folderName.trim();

    try {
      const newFolder = await createFolder(
        currentFolder?.id || "",
        cleanedName,
        projectId
      );

      if (hasSelectedAssets && newFolder) {
        const updatePromises = selectedAssetIds.map((assetId) =>
          updateAsset({ id: assetId, parent_id: newFolder.id })
        );
        await Promise.all(updatePromises);

        addNotification({
          type: "success",
          content: `Created folder "${cleanedName}" and moved ${
            selectedAssetIds.length
          } item${selectedAssetIds.length === 1 ? "" : "s"}`
        });

        setSelectedAssetIds([]);
        setSelectedAssets([]);
      } else {
        addNotification({
          type: "success",
          content: `Created folder "${cleanedName}"`
        });
      }

      // The sidebar hides its folder tree by default. Show it, so the folder
      // just made is on screen rather than behind a toggle.
      setFoldersVisible(true);
      setDialogOpen(false);
      refetchAssetsAndFolders();
    } catch (error) {
      console.error("Failed to create folder", error);
      setShowAlert("Failed to create folder. Please try again.");
    }
  }, [
    folderName,
    currentFolder?.id,
    hasSelectedAssets,
    selectedAssetIds,
    createFolder,
    updateAsset,
    addNotification,
    setDialogOpen,
    refetchAssetsAndFolders,
    setSelectedAssetIds,
    setSelectedAssets,
    setFoldersVisible,
    projectId
  ]);

  return (
    <Dialog
      className="asset-create-folder-dialog"
      open={dialogOpen}
      onClose={handleClose}
      maxWidth="xs"
      fullWidth
      title={hasSelectedAssets ? "Move to new folder" : "Create folder"}
      onConfirm={() => void handleCreateFolder()}
      confirmText={hasSelectedAssets ? "Move" : "Create"}
      actionButtonsProps={{
        confirmButtonProps: {
          className: "asset-create-folder-confirm-button button-confirm"
        },
        cancelButtonProps: {
          className: "asset-create-folder-cancel-button button-cancel"
        }
      }}
    >
      <FlexColumn gap={SPACING.md}>
        {showAlert && (
          <AlertBanner
            className="asset-create-folder-error-alert"
            severity="error"
            onClose={dismissAlert}
          >
            {showAlert}
          </AlertBanner>
        )}
        <TextInput
          className="asset-create-folder-input"
          label="Name"
          inputRef={inputRef}
          value={folderName}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleCreateFolder();
            }
          }}
          onChange={(e) => setFolderName(e.target.value)}
          fullWidth
          autoCorrect="off"
          spellCheck="false"
          helperText={
            hasSelectedAssets
              ? `${selectedAssets.length} assets selected: they will be moved to the new folder.`
              : undefined
          }
        />
      </FlexColumn>
    </Dialog>
  );
};

export default AssetCreateFolderConfirmation;
