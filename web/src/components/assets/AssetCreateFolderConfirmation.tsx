import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("translation", { keyPrefix: "i18n-next27" });
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

  const [folderName, setFolderName] = useState(() => t("assetCreateFolder.defaultName"));
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
      setFolderName(t("assetCreateFolder.defaultName"));
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
      setShowAlert(t("assetCreateFolder.specialCharacter"));
      return;
    }

    const invalidCharsFound = folderName.match(invalidCharsRegex);

    if (!folderName) {
      setShowAlert(t("assetCreateFolder.nameRequired"));
      return;
    } else if (folderName.length > 100) {
      setShowAlert(t("assetCreateFolder.maxLength"));
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
          content: t(selectedAssetIds.length === 1 ? "assetCreateFolder.createdAndMovedOne" : "assetCreateFolder.createdAndMovedOther", { name: cleanedName, count: selectedAssetIds.length })
        });

        setSelectedAssetIds([]);
        setSelectedAssets([]);
      } else {
        addNotification({
          type: "success",
          content: t("assetCreateFolder.created", { name: cleanedName })
        });
      }

      // The sidebar hides its folder tree by default. Show it, so the folder
      // just made is on screen rather than behind a toggle.
      setFoldersVisible(true);
      setDialogOpen(false);
      refetchAssetsAndFolders();
    } catch (error) {
      console.error("Failed to create folder", error);
      setShowAlert(t("assetCreateFolder.failed"));
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
      title={hasSelectedAssets ? t("assetCreateFolder.moveTitle") : t("assetCreateFolder.createTitle")}
      onConfirm={() => void handleCreateFolder()}
      confirmText={hasSelectedAssets ? t("assetCreateFolder.move") : t("assetCreateFolder.create")}
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
          label={t("assetCreateFolder.nameLabel")}
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
              ? t("assetCreateFolder.selectedHelper", { count: selectedAssets.length })
              : undefined
          }
        />
      </FlexColumn>
    </Dialog>
  );
};

export default AssetCreateFolderConfirmation;
