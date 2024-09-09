/** @jsxImportSource @emotion/react */
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
  ListItemText
} from "@mui/material";
import { InsertDriveFile } from "@mui/icons-material";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useAssetDeletion } from "../../serverState/useAssetDeletion";
import { useAssets } from "../../serverState/useAssets";
import { useAssetStore } from "../../stores/AssetStore";
import AssetTree from "./AssetTree";
import { Asset } from "../../stores/ApiTypes";
import { useAuth } from "../../stores/useAuth";
import { devError, devLog } from "../../utils/DevLog";
import ThemeNodetool from "../themes/ThemeNodetool";

interface AssetDeleteConfirmationProps {
  assets: string[];
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

const AssetDeleteConfirmation: React.FC<AssetDeleteConfirmationProps> = ({
  assets,
  isLoading,
  setIsLoading
}) => {
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
  const getAsset = useAssetStore((state) => state.get);
  const user = useAuth.getState().getUser();

  useEffect(() => {
    const countAssetTypes = async () => {
      setIsPreparingDelete(true);
      let folders = 0;
      let files = 0;
      const fileAssetsTemp: Asset[] = [];
      setTotalAssets(0);
      let hasRootFolder = false;

      for (const assetId of assets) {
        const asset = await getAsset(assetId);
        if (asset) {
          if (asset.content_type === "folder") {
            folders++;
            // Check if the asset is the root folder (either "1" or user.id)
            if (asset.id === "1" || (user && asset.id === user.id)) {
              hasRootFolder = true;
            }
          } else {
            files++;
            fileAssetsTemp.push(asset);
          }
        }
      }

      setFolderCount(folders);
      setFileCount(files);
      setFileAssets(fileAssetsTemp);
      if (files > 0 && folders === 0) {
        setTotalAssets(files);
      }
      setIsPreparingDelete(false);
      setShowRootFolderWarning(hasRootFolder);
    };

    countAssetTypes();
  }, [assets, getAsset, user]);

  const handleTotalAssetsCalculated = useCallback((assetCount: number) => {
    setTotalAssets(assetCount);
  }, []);

  const executeDeletion = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await mutation.mutateAsync(assets);
      if (response === undefined) {
        devError("Received undefined response from server");
      } else if (typeof response === "object" && response !== null) {
        devLog("Deleted asset IDs:", (response as any).deleted_asset_ids);
      }
      setDialogOpen(false);
      await refetchAssetsAndFolders();
    } catch (error) {
      if (error instanceof Error) {
        devError("Execute deletion error:", error.message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [mutation, assets, setDialogOpen, refetchAssetsAndFolders, setIsLoading]);

  const getDialogTitle = () => {
    if (isAssetTreeLoading) {
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
  };

  return (
    <Dialog
      className="asset-delete-confirmation"
      open={dialogOpen}
      onClose={() => setDialogOpen(false)}
    >
      <DialogTitle sx={{ color: ThemeNodetool.palette.c_warning }}>
        {getDialogTitle()}
      </DialogTitle>
      <DialogContent
        style={{
          minWidth: "600px",
          minHeight: "200px",
          maxHeight: "60vh"
        }}
      >
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
        <Button onClick={() => setDialogOpen(false)} disabled={isLoading}>
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
