/** @jsxImportSource @emotion/react */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogActions,
  DialogTitle,
  Button,
  LinearProgress,
  Typography,
} from "@mui/material";
import { getMousePosition } from "../../utils/MousePosition";
import { UseMutationResult } from "@tanstack/react-query";
import dialogStyles from "../../styles/DialogStyles";
import { Asset } from "../../stores/ApiTypes";
import useAssets from "../../serverState/useAssets";

interface AssetDeleteConfirmationProps {
  dialogOpen: boolean;
  assets: string[];
  setDialogOpen: (open: boolean) => void;
  mutation: UseMutationResult<void, Error, string[], unknown>;
}

const AssetDeleteConfirmation = ({
  dialogOpen,
  setDialogOpen,
  assets,
  mutation,
}: AssetDeleteConfirmationProps) => {
  const [dialogPosition, setDialogPosition] = useState({ x: 0, y: 0 });
  const [hasNonEmptyFolder, setHasNonEmptyFolder] = useState(false);
  const {
    assets: { folders, files },
    folderTree,
  } = useAssets(); // Updated properties

  const assetItems = useMemo(
    () => folders.concat(files).filter((asset) => assets.includes(asset.id)),
    [assets, folders, files]
  );

  const checkFolders = useCallback(async () => {
    try {
      const folders = assetItems.filter(
        (asset: Asset) => asset.content_type === "folder"
      );

      let hasNonEmpty = false;
      if (folderTree) {
        // Check if folderTree is defined
        for (const folder of folders) {
          const childAssets =
            folderTree.find((f: { id: string }) => f.id === folder.id)
              ?.children || [];
          if (childAssets.length > 0) {
            hasNonEmpty = true;
            break;
          }
        }
      }

      setHasNonEmptyFolder(hasNonEmpty);
    } catch (error) {
      console.error("Error checking folders:", error);
    }
  }, [assetItems, folderTree]);

  useEffect(() => {
    if (dialogOpen) {
      const mousePosition = getMousePosition();
      setDialogPosition({ x: mousePosition.x, y: mousePosition.y });

      if (assetItems.length > 0) {
        checkFolders();
      }
    }
  }, [dialogOpen, assetItems, checkFolders]);

  const executeDeletion = useCallback(async () => {
    try {
      await mutation.mutateAsync(assets);
      setDialogOpen(false);
    } catch (error) {
      console.error("Error deleting assets:", error);
    }
  }, [mutation, assets, setDialogOpen]);

  const screenWidth = window.innerWidth;
  const objectWidth = 450;
  const leftPosition = dialogPosition.x - objectWidth / 2;

  const safeLeft = Math.min(
    Math.max(leftPosition - 50, 50),
    screenWidth - objectWidth - 50
  );

  return (
    <Dialog
      css={dialogStyles}
      open={dialogOpen}
      onClose={() => setDialogOpen(false)}
      aria-labelledby="alert-dialog-title"
      aria-describedby="alert-dialog-description"
      componentsProps={{
        backdrop: {
          style: {
            backgroundColor: "transparent",
          },
        },
      }}
      sx={{
        left: `${safeLeft}px`,
        top: `${dialogPosition.y - 300}px`,
      }}
    >
      <DialogTitle className="dialog-title" id="alert-dialog-title">
        {mutation.status === "pending" && ( // Corrected status comparison
          <>
            <Typography variant="h5" color="error">
              {"Deleting assets..."}
            </Typography>
            <LinearProgress aria-label="deleting-assets" color="secondary" />
          </>
        )}
        {mutation.status === "error" && (
          <Typography variant="h5" color="error">
            {"Error deleting assets."}
          </Typography>
        )}
        {mutation.status === "idle" && !hasNonEmptyFolder && (
          <>
            <span>
              {`${assets?.length} ${assets?.length === 1 ? "asset" : "assets"}`}
            </span>
            {" will be deleted"}
          </>
        )}
      </DialogTitle>
      {hasNonEmptyFolder && (
        <>
          <Typography className="error-message">
            {"Cannot delete folders that are not empty."}
          </Typography>
          <Typography className="error-notice">
            {"Please delete the assets in the folder first."}
          </Typography>
        </>
      )}
      <ul className="asset-names">
        {assetItems?.map((asset: Asset) => (
          <li key={asset.id}>{asset.name}</li>
        ))}
      </ul>
      <DialogActions className="dialog-actions">
        {!hasNonEmptyFolder ? (
          <>
            <Button
              className="button-cancel"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="button-confirm"
              onClick={executeDeletion}
              autoFocus
            >
              Delete
            </Button>
          </>
        ) : (
          <Button className="button-ok" onClick={() => setDialogOpen(false)}>
            OK
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default AssetDeleteConfirmation;
