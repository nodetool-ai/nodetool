/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Button,
  CircularProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography
} from "@mui/material";
import { InsertDriveFile } from "@mui/icons-material";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useAssetDeletion } from "../../serverState/useAssetDeletion";
import { useAssets } from "../../serverState/useAssets";
import AssetTree from "./AssetTree";
import { Asset } from "../../stores/ApiTypes";
import { useAuth } from "../../stores/useAuth";
import log from "loglevel";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

const styles = (theme: Theme) =>
  css({
    ".asset-delete-confirmation-content": {
      minWidth: "600px",
      minHeight: "200px",
      maxHeight: "60vh"
    },
    ".asset-delete-confirmation-content::after": {
      content: "''",
      width: "100%",
      height: "4em",
      display: "block",
      background: `linear-gradient(to top, ${theme.vars.palette.grey[600]}, transparent)`,
      position: "absolute",
      bottom: "3em",
      left: 0
    }
  });

interface AssetDeleteConfirmationProps {
  assets: string[];
}

const AssetDeleteConfirmation: React.FC<AssetDeleteConfirmationProps> = ({
  assets
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [totalAssets, setTotalAssets] = useState(0);
  const [folderCount, setFolderCount] = useState(0);
  const [fileCount, setFileCount] = useState(0);
  const [fileAssets, setFileAssets] = useState<Asset[]>([]);
  const [isAssetTreeLoading, setIsAssetTreeLoading] = useState(true);
  const [isPreparingDelete, setIsPreparingDelete] = useState(true);
  const [showRootFolderWarning, setShowRootFolderWarning] = useState(false);
  const dialogOpen = useAssetGridStore((state) => state.deleteDialogOpen);
  const setDialogOpen = useAssetGridStore((state) => state.setDeleteDialogOpen);
  const { mutation } = useAssetDeletion();
  const { refetchAssetsAndFolders } = useAssets();
  const selectedAssets = useAssetGridStore((state) => state.selectedAssets);
  const user = useAuth((state) => state.user);
  const theme = useTheme();

  useEffect(() => {
    if (!dialogOpen) {return;} // Only process when dialog is actually open

    const countAssetTypes = () => {
      setIsPreparingDelete(true);
      let folders = 0;
      let files = 0;
      const fileAssetsTemp: Asset[] = [];
      setTotalAssets(0);
      let hasRootFolder = false;

      for (const asset of selectedAssets) {
        if (asset.content_type === "folder") {
          folders++;
          if (asset.id === "1" || (user && asset.id === user.id)) {
            hasRootFolder = true;
          }
        } else {
          files++;
          fileAssetsTemp.push(asset);
        }
      }

      setFolderCount(folders);
      setFileCount(files);
      setFileAssets(fileAssetsTemp);
      if (folders === 0) {
        setIsAssetTreeLoading(false);
      }
      if (files > 0 && folders === 0) {
        setTotalAssets(files);
      }
      setIsPreparingDelete(false);
      setShowRootFolderWarning(hasRootFolder);
    };

    countAssetTypes();
  }, [dialogOpen, selectedAssets, user]);

  const handleTotalAssetsCalculated = useCallback((assetCount: number) => {
    setTotalAssets(assetCount);
  }, []);

  const executeDeletion = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await mutation.mutateAsync(assets);
      if (response === undefined) {
        log.error("Received undefined response from server");
      } else if (typeof response === "object" && response !== null) {
        log.info("Deleted asset IDs:", (response as any).deleted_asset_ids);
      }
      setDialogOpen(false);
      await refetchAssetsAndFolders();
    } catch (error) {
      if (error instanceof Error) {
        log.error("Execute deletion error:", error.message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [mutation, assets, setDialogOpen, refetchAssetsAndFolders, setIsLoading]);

  const getDialogTitle = useCallback(() => {
    if (isAssetTreeLoading && folderCount > 0) {
      return "Preparing to delete...";
    } else if (showRootFolderWarning) {
      return "Warning: The root folder cannot be deleted.";
    } else if (folderCount === 1 && fileCount === 0) {
      return `Delete folder containing ${totalAssets - 1} file${
        totalAssets - 1 !== 1 ? "s" : ""
      }?`;
    } else if (folderCount > 0) {
      return `Delete ${folderCount} folder${
        folderCount !== 1 ? "s" : ""
      } and ${fileCount} file${
        fileCount !== 1 ? "s" : ""
      } containing ${totalAssets} item${totalAssets !== 1 ? "s" : ""}?`;
    } else {
      return `Delete ${fileCount} file${fileCount !== 1 ? "s" : ""}?`;
    }
  }, [isAssetTreeLoading, folderCount, fileCount, totalAssets, showRootFolderWarning]);

  const handleClose = useCallback(() => {
    setDialogOpen(false);
  }, [setDialogOpen]);

  return (
    <Dialog
      css={styles(theme)}
      className="asset-delete-confirmation"
      open={dialogOpen}
      onClose={handleClose}
    >
      <DialogTitle sx={{ color: theme.vars.palette.warning.main }}>
        {getDialogTitle()}
      </DialogTitle>
      <DialogContent className="asset-delete-confirmation-content">
        <Typography
          variant="body1"
          color={theme.vars.palette.grey[200]}
          style={{ marginBottom: "1em" }}
        >
          You can right click selected assets and download them before deleting.
        </Typography>
        {isPreparingDelete ? (
          <CircularProgress size={16} />
        ) : (
          <>
            {!showRootFolderWarning && (
              <>
                {folderCount > 0 ? (
                  assets.map((assetId) => (
                    <AssetTree
                      key={assetId}
                      folderId={assetId}
                      onTotalAssetsCalculated={handleTotalAssetsCalculated}
                      onLoading={setIsAssetTreeLoading}
                    />
                  ))
                ) : (
                  <List dense>
                    {fileAssets.map((file) => (
                      <ListItem key={file.id}>
                        <ListItemIcon>
                          <InsertDriveFile />
                        </ListItemIcon>
                        <ListItemText primary={file.name} />
                      </ListItem>
                    ))}
                  </List>
                )}
              </>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          onClick={executeDeletion}
          disabled={isLoading || isAssetTreeLoading || showRootFolderWarning}
          color="error"
        >
          {isLoading ? <CircularProgress size={24} /> : "Delete"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AssetDeleteConfirmation;
