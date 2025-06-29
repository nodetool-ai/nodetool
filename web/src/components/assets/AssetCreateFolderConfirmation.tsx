/** @jsxImportSource @emotion/react */

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Button,
  TextField,
  Typography,
  Alert
} from "@mui/material";
import { getMousePosition } from "../../utils/MousePosition";
import log from "loglevel";
import { useAssetStore } from "../../stores/AssetStore";
import dialogStyles from "../../styles/DialogStyles";
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

  const [dialogPosition, setDialogPosition] = useState({ x: 0, y: 0 });
  const [folderName, setFolderName] = useState("New Folder");
  const [showAlert, setShowAlert] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const createFolder = useAssetStore((state) => state.createFolder);
  const updateAsset = useAssetStore((state) => state.update);
  const { refetchAssetsAndFolders, folderFilesFiltered } = useAssets();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  // Derive selectedAssets from selectedAssetIds and current assets to ensure they're in sync
  const selectedAssets = useMemo(() => {
    if (selectedAssetIds.length === 0) return [];
    return selectedAssetIds
      .map((id) => folderFilesFiltered.find((asset) => asset.id === id))
      .filter(Boolean) as Asset[];
  }, [selectedAssetIds, folderFilesFiltered]);

  // Check if we have non-folder assets selected for moving
  const isFolder = selectedAssets.some(
    (asset) => asset.content_type === "folder"
  );
  const hasSelectedAssets = selectedAssets.length > 0 && !isFolder;

  useEffect(() => {
    if (dialogOpen) {
      setFolderName("New Folder");
      const mousePosition = getMousePosition();
      setDialogPosition({ x: mousePosition.x, y: mousePosition.y });
      setShowAlert(null);
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [dialogOpen]);

  const handleCreateFolder = useCallback(async () => {
    const invalidCharsRegex = /[/*?"<>|#%{}^[\]`'=&$§!°äüö;+~|$!]+/g;

    function startsWithEmoji(fileName: string): boolean {
      // Unicode range for emojis
      const emojiRegex =
        /^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      return emojiRegex.test(fileName);
    }

    // Check if the name starts with a special character
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

    // Find invalid characters in the name
    const invalidCharsFound = folderName.match(invalidCharsRegex);

    // Check for empty or overly long names
    if (!folderName) {
      setShowAlert("Name cannot be empty.");
      return;
    } else if (folderName.length > 100) {
      setShowAlert("Max folder name length is 100 characters.");
      return;
    }

    // complain about invalid characters
    if (invalidCharsFound) {
      const uniqueInvalidChars = invalidCharsFound.filter(
        (char, index, array) => array.indexOf(char) === index
      );
      setShowAlert(`Invalid characters: ${uniqueInvalidChars.join(", ")}`);
      return;
    }

    const cleanedName = folderName.trim();

    try {
      // Create the folder
      const newFolder = await createFolder(
        currentFolder?.id || "",
        cleanedName
      );

      // If we have selected assets and they're not folders, move them to the new folder
      if (hasSelectedAssets && newFolder) {
        const updatePromises = selectedAssetIds.map((assetId) =>
          updateAsset({ id: assetId, parent_id: newFolder.id })
        );
        await Promise.all(updatePromises);

        addNotification({
          type: "success",
          content: `CREATE FOLDER: ${cleanedName} and moved ${selectedAssetIds.length} items`
        });

        // Clear selection since assets were moved
        setSelectedAssetIds([]);
        setSelectedAssets([]);
      } else {
        addNotification({
          type: "success",
          content: `CREATE FOLDER: ${cleanedName}`
        });
      }

      setDialogOpen(false);
      refetchAssetsAndFolders();
    } catch (error) {
      log.error("Failed to create folder", error);
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
    setSelectedAssets
  ]);

  const screenWidth = window.innerWidth;
  const objectWidth = 600;
  const leftPosition = dialogPosition.x - objectWidth;

  const safeLeft = Math.min(
    Math.max(leftPosition, 50),
    screenWidth - objectWidth - 50
  );

  return (
    <Dialog
      css={dialogStyles}
      open={dialogOpen}
      onClose={() => setDialogOpen(false)}
      aria-labelledby="alert-dialog-title"
      aria-describedby="alert-dialog-description"
      style={{
        left: `${safeLeft}px`,
        top: `${dialogPosition.y - 300}px`
      }}
    >
      <DialogTitle className="dialog-title" id="alert-dialog-title">
        {hasSelectedAssets
          ? "Move selected to new folder"
          : "Create new folder"}
      </DialogTitle>

      <DialogContent className="dialog-content">
        {showAlert && (
          <Alert severity="error" onClose={() => setShowAlert(null)}>
            {showAlert}
          </Alert>
        )}
        <TextField
          className="input-field"
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
        />
      </DialogContent>
      <DialogActions className="dialog-actions">
        <Button className="button-cancel" onClick={() => setDialogOpen(false)}>
          Cancel
        </Button>
        <Button className="button-confirm" onClick={handleCreateFolder}>
          {hasSelectedAssets ? "Move to New Folder" : "Create Folder"}
        </Button>
      </DialogActions>
      {hasSelectedAssets && (
        <div>
          <Typography className="notice" variant="body2">
            <span>{selectedAssets.length} assets selected:</span> <br />
            They will be moved to the new folder.
          </Typography>
        </div>
      )}
    </Dialog>
  );
};

export default AssetCreateFolderConfirmation;
