import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  Paper,
  Box,
  Button,
  TextField,
  Typography,
  Alert
} from "@mui/material";
import { getMousePosition } from "../../utils/MousePosition";
import log from "loglevel";
import { useAssetStore } from "../../stores/AssetStore";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import useAssets from "../../serverState/useAssets";
import { useNotificationStore } from "../../stores/NotificationStore";
import { Asset } from "../../stores/ApiTypes";
import { useTheme } from "@mui/material/styles";

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
  const handleClose = useCallback(() => {
    setDialogOpen(false);
  }, [setDialogOpen]);
  const inputRef = useRef<HTMLInputElement>(null);
  const theme = useTheme();
  const createFolder = useAssetStore((state) => state.createFolder);
  const updateAsset = useAssetStore((state) => state.update);
  const { refetchAssetsAndFolders, folderFilesFiltered } = useAssets();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  // Build a Map for O(1) lookups instead of O(n*m) nested find operations
  const assetMap = useMemo(() => {
    const map = new Map<string, Asset>();
    folderFilesFiltered.forEach((asset) => map.set(asset.id, asset));
    return map;
  }, [folderFilesFiltered]);

  // Derive selectedAssets from selectedAssetIds and current assets to ensure they're in sync
  // Uses Map for O(n) lookup instead of nested O(n*m) find operations
  const selectedAssets = useMemo(() => {
    if (selectedAssetIds.length === 0) {
      return [];
    }
    return selectedAssetIds
      .map((id) => assetMap.get(id))
      .filter((asset): asset is Asset => asset !== undefined);
  }, [selectedAssetIds, assetMap]);

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
  const dialogWidth = 400;
  const leftPosition = dialogPosition.x - dialogWidth;

  const safeLeft = Math.min(
    Math.max(leftPosition, 50),
    screenWidth - dialogWidth - 50
  );

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (event: React.MouseEvent) => {
      if (event.target === event.currentTarget) {
        setDialogOpen(false);
      }
    },
    [setDialogOpen]
  );

  if (!dialogOpen) {
    return null;
  }

  return (
    <div
      className="asset-create-folder-backdrop"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "transparent",
        zIndex: 1300
      }}
      onClick={handleBackdropClick}
    >
      <Paper
        className="asset-create-folder-dialog"
        elevation={8}
        sx={{
          position: "absolute",
          left: `${safeLeft}px`,
          top: `${dialogPosition.y - 200}px`,
          width: 400,
          maxWidth: "calc(100vw - 32px)",
          backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.9)`,
          backdropFilter: "blur(10px)",
          borderRadius: 1,
          overflow: "hidden"
        }}
      >
        <Typography
          className="asset-create-folder-dialog-title"
          sx={{
            fontFamily: theme.fontFamily1,
            fontSize: theme.fontSizeSmall,
            color: theme.vars.palette.grey[100],
            margin: ".5em 0 0",
            padding: "1em"
          }}
        >
          {hasSelectedAssets
            ? "Move selected to new folder"
            : "Create new folder"}
        </Typography>

        <Box sx={{ padding: "0 .5em" }}>
          {showAlert && (
            <Alert
              className="asset-create-folder-error-alert"
              severity="error"
              onClose={handleClose}
            >
              {showAlert}
            </Alert>
          )}
          <TextField
            className="asset-create-folder-input"
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
            sx={{
              padding: "8px",
              "& input": {
                fontFamily: theme.fontFamily1,
                padding: "8px 12px"
              }
            }}
          />
        </Box>

        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 1,
            padding: ".5em 1em"
          }}
        >
          <Button
            className="asset-create-folder-cancel-button"
            onClick={handleClose}
            sx={{ color: theme.vars.palette.grey[100] }}
          >
            Cancel
          </Button>
          <Button
            className="asset-create-folder-confirm-button"
            onClick={handleCreateFolder}
            sx={{
              color: "var(--palette-primary-main)",
              fontWeight: "bold"
            }}
          >
            {hasSelectedAssets ? "Move to New Folder" : "Create Folder"}
          </Button>
        </Box>

        {hasSelectedAssets && (
          <Box className="asset-create-folder-notice-container">
            <Typography
              className="asset-create-folder-notice"
              variant="body2"
              sx={{
                backgroundColor: theme.vars.palette.c_attention,
                color: theme.vars.palette.grey[1000],
                fontFamily: theme.fontFamily1,
                fontSize: theme.fontSizeSmall,
                padding: ".5em 1em"
              }}
            >
              <span className="asset-create-folder-selected-count">
                {selectedAssets.length} assets selected:
              </span>{" "}
              <br />
              They will be moved to the new folder.
            </Typography>
          </Box>
        )}
      </Paper>
    </div>
  );
};

export default AssetCreateFolderConfirmation;
