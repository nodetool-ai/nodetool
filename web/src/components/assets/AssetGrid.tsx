/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { useCallback, useEffect, useRef, useState } from "react";

//mui
import { Divider } from "@mui/material";
import { Box, Typography } from "@mui/material";

//store
import { useNodeStore } from "../../stores/NodeStore";
import { useAssetStore } from "../../stores/AssetStore";
import useSessionStateStore from "../../stores/SessionStateStore";
//server state
import { useAssetDeletion } from "../../serverState/useAssetDeletion";
import { useAssetUpload } from "../../serverState/useAssetUpload";
//utils
import { prettyDate } from "../../utils/formatDateAndTime";
import useKeyPressedListener from "../../utils/KeyPressedListener";

//components
import ThemeNodetool from "../themes/ThemeNodetool";
import { useAssetUpdate } from "../../serverState/useAssetUpdate";
import useAssets from "../../serverState/useAssets";
import { Asset } from "../../stores/ApiTypes";
import AudioPlayer from "../audio/AudioPlayer";
//asset components
import Dropzone from "./Dropzone";
import AssetActions from "./AssetActions";
import AssetItemContextMenu from "../context_menus/AssetItemContextMenu";
import AssetDeleteConfirmation from "./AssetDeleteConfirmation";
import AssetRenameConfirmation from "./AssetRenameConfirmation";
import AssetUploadOverlay from "./AssetUploadOverlay";
import AssetGridContent from "./AssetGridContent";
import SearchInput from "../search/SearchInput";
import AssetMoveToFolderConfirmation from "./AssetMoveToFolderConfirmation";

const styles = (theme: any) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-start",
      height: "100%"
    },
    ".asset-menu": {
      margin: "0",
      display: "flex",
      flexWrap: "wrap",
      justifyContent: "start",
      alignItems: "start",
      gap: ".5em"
    },
    ".dropzone": {
      display: "flex",
      flexDirection: "column",
      position: "relative",
      flexGrow: 1,
      flexShrink: 1,
      width: "100%",
      maxHeight: "calc(-273px + 100vh)"
    },
    ".selected-asset-info": {
      backgroundColor: theme.palette.c_gray1,
      minHeight: "70px",
      minWidth: "200px",
      overflowY: "auto",
      overflowX: "hidden",
      fontSize: ThemeNodetool.fontSizeSmall,
      padding: "0.1em 0.2em",

      color: theme.palette.c_gray5
    },
    ".file-upload-button button": {
      width: "100%",
      maxWidth: "155px"
    },
    ".current-folder": {
      minWidth: "100px",
      fontSize: ThemeNodetool.fontSizeSmall,
      color: theme.palette.c_gray5,
      paddingTop: "0.5em"
    },
    ".folder-slash": {
      color: theme.palette.c_hl1,
      fontWeight: 600,
      marginRight: "0.25em",
      userSelect: "none"
    },
    ".selected-info": {
      fontSize: "12px !important",
      color: theme.palette.c_gray4,
      minHeight: "25px",
      display: "block"
    },
    ".audio-controls-container": {
      position: "absolute",
      display: "flex",
      flexDirection: "column",
      gap: "0.25em",
      zIndex: 5000,
      bottom: "0",
      left: "0",
      width: "100%",
      padding: "0.5em",
      backgroundColor: theme.palette.c_gray1
    }
  });

/**
 * AssetGrid displays a grid of assets.
 * New assets can be dropped from the OS file system.
 */

interface AssetGridProps {
  maxItemSize?: number;
  itemSpacing?: number;
}

const AssetGrid = ({ maxItemSize = 10, itemSpacing = 2 }: AssetGridProps) => {
  const { sortedAssets, currentAssets, error } = useAssets();
  const { selectedAssetIds, setSelectedAssetIds, selectedAssets } =
    useSessionStateStore();
  const { mutation: deleteMutation } = useAssetDeletion();
  const { mutation: updateMutation } = useAssetUpdate();
  const { mutation: moveMutation } = useAssetUpdate();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [moveToFolderDialogOpen, setMoveToFolderDialogOpen] = useState(false);
  const openDeleteDialog = () => {
    setDeleteDialogOpen(true);
  };
  const openRenameDialog = () => {
    setRenameDialogOpen(true);
  };
  const openMoveToFolderDialog = () => {
    setMoveToFolderDialogOpen(true);
  };
  const [searchTerm, setSearchTerm] = useState("");
  const currentFolder = useAssetStore((state) => state.currentFolder);
  const currentFolderId = useAssetStore((state) => state.currentFolderId);
  const setCurrentFolderId = useAssetStore((state) => state.setCurrentFolderId);
  const workflow = useNodeStore((state) => state.workflow);
  const [lastSelectedAssetId, setLastSelectedAssetId] = useState<string | null>(
    null
  );

  const [currentAudioAsset, setCurrentAudioAsset] = useState<Asset | null>(
    null
  );
  const F2KeyPressed = useKeyPressedListener("F2");
  const controlKeyPressed = useKeyPressedListener("Control");
  const metaKeyPressed = useKeyPressedListener("Meta");
  const shiftKeyPressed = useKeyPressedListener("Shift");
  const spaceKeyPressed = useKeyPressedListener(" ");

  // deselect
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const clickedElement = e.target as HTMLElement;
      if (!shiftKeyPressed && !controlKeyPressed && !metaKeyPressed) {
        if (
          // deselect
          clickedElement.classList.contains("content-type-header") ||
          clickedElement.classList.contains("selected-info") ||
          clickedElement.classList.contains("infinite-scroll-component") ||
          clickedElement.classList.contains("asset-grid-flex") ||
          clickedElement.classList.contains("divider") ||
          clickedElement.classList.contains("selected-info") ||
          clickedElement.classList.contains("current-folder") ||
          clickedElement.classList.contains("asset-info") ||
          clickedElement.classList.contains("asset-grid-container") ||
          clickedElement.classList.contains("MuiTabs-flexContainer")
        ) {
          setSelectedAssetIds([]);
        }
      }
    };
    window.addEventListener("click", handleClickOutside);
    return () => {
      window.removeEventListener("click", handleClickOutside);
    };
  }, [shiftKeyPressed, controlKeyPressed, metaKeyPressed, setSelectedAssetIds]);

  // rename with F2 key
  useEffect(() => {
    if (F2KeyPressed && selectedAssetIds.length > 0) {
      setRenameDialogOpen(true);
    }
  }, [F2KeyPressed, selectedAssetIds]);

  // select
  const handleSelectAsset = useCallback(
    (assetId: string) => {
      const selectedAssetIndex = sortedAssets.findIndex(
        (asset) => asset.id === assetId
      );
      const lastSelectedIndex = lastSelectedAssetId
        ? sortedAssets.findIndex((asset) => asset.id === lastSelectedAssetId)
        : -1;

      const selectedAsset = sortedAssets.find((asset) => asset.id === assetId);
      const isAudio = selectedAsset?.content_type.match("audio") !== null;

      if (shiftKeyPressed && lastSelectedIndex !== -1) {
        const start = Math.min(selectedAssetIndex, lastSelectedIndex);
        const end = Math.max(selectedAssetIndex, lastSelectedIndex);
        const newSelectedIds = sortedAssets
          .slice(start, end + 1)
          .map((asset) => asset.id);
        setSelectedAssetIds(newSelectedIds);
      } else if (controlKeyPressed || metaKeyPressed) {
        const newAssetIds = selectedAssetIds.includes(assetId)
          ? selectedAssetIds.filter((id) => id !== assetId)
          : [...selectedAssetIds, assetId];
        setSelectedAssetIds(newAssetIds);
      } else {
        setSelectedAssetIds([assetId]);
      }

      setLastSelectedAssetId(assetId);

      // audio file
      if (isAudio) {
        setCurrentAudioAsset(selectedAsset ? selectedAsset : null);
      } else {
        setCurrentAudioAsset(null);
      }
    },
    [
      lastSelectedAssetId,
      shiftKeyPressed,
      controlKeyPressed,
      metaKeyPressed,
      setSelectedAssetIds,
      selectedAssetIds,
      sortedAssets
    ]
  );

  // reset currentAudioAsset when selectedAssetIds is empty
  useEffect(() => {
    if (selectedAssetIds.length === 0) {
      setCurrentAudioAsset(null);
    }
  }, [selectedAssetIds, setCurrentAudioAsset]);

  const handleSelectAllAssets = useCallback(() => {
    const allAssetIds = currentAssets.map((asset) => asset.id);
    setSelectedAssetIds(allAssetIds);
    setLastSelectedAssetId(null);
  }, [currentAssets, setSelectedAssetIds]);

  const handleDeselectAssets = useCallback(() => {
    setSelectedAssetIds([]);
    setLastSelectedAssetId(null);
  }, [setSelectedAssetIds]);

  const containerRef = useRef(null);

  const { mutation: uploadMutation } = useAssetUpload();

  const uploadFiles = useCallback((files: File[]) => {
    uploadMutation.mutate({
      files,
      workflow_id: workflow.id,
      parent_id: currentFolderId
    });
  },
    [currentFolderId, uploadMutation, workflow.id]
  );

  //search
  const handleSearchChange = (newSearchTerm: string) => {
    setSearchTerm(newSearchTerm);
  };

  const handleSearchClear = () => {
    setSearchTerm("");
  };

  return (
    <Box css={styles} className="asset-grid-container" ref={containerRef}>
      {error && <Typography sx={{ color: "red" }}>{error.message}</Typography>}
      <AssetUploadOverlay />
      <div className="asset-menu">
        <SearchInput
          onSearchChange={handleSearchChange}
          onSearchClear={handleSearchClear}
          focusOnTyping={false}
          focusSearchInput={false}
          focusOnEscapeKey={false}
          maxWidth={"9em"}
        />
        <AssetActions
          setSelectedAssetIds={setSelectedAssetIds}
          handleSelectAllAssets={handleSelectAllAssets}
          handleDeselectAssets={handleDeselectAssets}
          maxItemSize={maxItemSize}
        />

        {/* Current Folder + Selected Info */}
        <Divider />
        <Typography className="current-folder">
          <span className="folder-slash">/</span>
          {currentFolder && `${currentFolder.name}`}
        </Typography>
        <div className="selected-asset-info">
          <Typography variant="body1" className="selected-info">
            {selectedAssetIds.length > 0 && (
              <>
                {selectedAssetIds.length}{" "}
                {selectedAssetIds.length === 1 ? "item " : "items "}
                selected
              </>
            )}
          </Typography>
          {selectedAssetIds.length === 1 && (
            <Typography variant="body2" className="asset-info">
              <span
                style={{
                  color: "white",
                  fontSize: ThemeNodetool.fontSizeSmall
                }}
              >
                {selectedAssets[0]?.name}{" "}
              </span>
              <br />
              {selectedAssets[0]?.content_type}
              <br />
              {prettyDate(selectedAssets[0]?.created_at)}
            </Typography>
          )}
        </div>
      </div>
      <Dropzone onDrop={uploadFiles}>
        <div className="br">
          <br />
        </div>
        <AssetGridContent
          selectedAssetIds={selectedAssetIds}
          handleSelectAsset={handleSelectAsset}
          setCurrentFolderId={setCurrentFolderId}
          setSelectedAssetIds={setSelectedAssetIds}
          openDeleteDialog={openDeleteDialog}
          openRenameDialog={openRenameDialog}
          setCurrentAudioAsset={setCurrentAudioAsset}
          itemSpacing={itemSpacing}
          searchTerm={searchTerm}
        />
      </Dropzone>
      <Divider />
      {currentAudioAsset && (
        <AudioPlayer
          fontSize="small"
          alwaysShowControls={true}
          url={currentAudioAsset?.get_url || ""}
          filename={currentAudioAsset?.name}
          height={30}
          waveformHeight={30}
          barHeight={1.0}
          minimapHeight={20}
          minimapBarHeight={1.0}
          waveColor="#ddd"
          progressColor="#666"
          minPxPerSec={1}
          playOnLoad={spaceKeyPressed}
        />
      )}
      <AssetItemContextMenu
        openDeleteDialog={openDeleteDialog}
        openRenameDialog={openRenameDialog}
        openMoveToFolderDialog={openMoveToFolderDialog}
      />
      <AssetDeleteConfirmation
        mutation={deleteMutation}
        dialogOpen={deleteDialogOpen}
        setDialogOpen={setDeleteDialogOpen}
        assets={selectedAssetIds}
      />
      <AssetRenameConfirmation
        mutation={updateMutation}
        dialogOpen={renameDialogOpen}
        setDialogOpen={setRenameDialogOpen}
        assets={selectedAssetIds}
      />
      <AssetMoveToFolderConfirmation
        mutation={moveMutation}
        dialogOpen={moveToFolderDialogOpen}
        setDialogOpen={setMoveToFolderDialogOpen}
        assets={selectedAssetIds}
      />
    </Box>
  );
};

export default AssetGrid;
