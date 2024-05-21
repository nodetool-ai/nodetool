/** @jsxImportSource @emotion/react */

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Button,
  Alert
} from "@mui/material";
import { getMousePosition } from "../../utils/MousePosition";
import { devLog } from "../../utils/DevLog";
import { UseMutationResult } from "react-query";
import { AssetUpdate } from "../../stores/AssetStore";
import dialogStyles from "../../styles/DialogStyles";
import FolderTree from "./FolderTree";
import useSessionStateStore from "../../stores/SessionStateStore";
import { Asset } from "../../stores/ApiTypes";

interface AssetMoveToFolderConfirmationProps {
  dialogOpen: boolean;
  assets: string[];
  setDialogOpen: (open: boolean) => void;
  mutation: UseMutationResult<any, unknown, AssetUpdate[], unknown>;
}

const AssetMoveToFolderConfirmation: React.FC<
  AssetMoveToFolderConfirmationProps
> = (props) => {
  const { dialogOpen, setDialogOpen, assets, mutation } = props;
  const [dialogPosition, setDialogPosition] = useState({ x: 0, y: 0 });
  const [showAlert, setShowAlert] = useState<string | null>(null);
  const selectedAssets = useSessionStateStore((state) => state.selectedAssets);

  const handleSelectFolder = useCallback(
    async (folderId: string) => {
      devLog("folderId", folderId);
      devLog("selectedAssets", selectedAssets);
      const assetUpdates = selectedAssets.map((asset: Asset) => ({
        id: asset.id,
        parent_id: folderId
      }));
      await mutation.mutateAsync(assetUpdates);
    },
    [selectedAssets, mutation]
  );

  useEffect(() => {
    if (dialogOpen) {
      const mousePosition = getMousePosition();
      setDialogPosition({ x: mousePosition.x, y: mousePosition.y });
      setShowAlert("");
    }
  }, [dialogOpen, assets]);

  const handleMoveToFolder = useCallback(async () => {
    const assetsToMove = assets.map((assetId) => ({
      id: assetId
    }));

    await mutation.mutateAsync(assetsToMove);

    setDialogOpen(false);
  }, [mutation, assets, setDialogOpen]);

  const screenWidth = window.innerWidth;
  const objectWidth = 500;
  const leftPosition = dialogPosition.x - objectWidth;
  const safeLeft = Math.min(
    Math.max(leftPosition, 0),
    screenWidth - objectWidth
  );

  return (
    <Dialog
      css={dialogStyles}
      open={dialogOpen}
      onClose={() => setDialogOpen(false)}
      aria-labelledby="alert-dialog-title"
      aria-describedby="alert-dialog-description"
      PaperProps={{
        style: {
          width: "500px"
        }
      }}
      componentsProps={{
        backdrop: {
          style: {
            backgroundColor: "transparent"
          }
        }
      }}
      style={{
        left: `${safeLeft}px`,
        top: `${dialogPosition.y - 300}px`,
        height: "600px",
        maxHeight: "600px"
      }}
    >
      <DialogTitle className="dialog-title" id="alert-dialog-title">
        Select new folder for
        <span>
          {` ${assets?.length} ${assets?.length === 1 ? "asset" : "assets"}`}
        </span>
        :
      </DialogTitle>

      <DialogContent className="dialog-content">
        {showAlert && (
          <Alert severity="success" onClose={() => setShowAlert(null)}>
            {showAlert}
          </Alert>
        )}
        <FolderTree onSelect={handleSelectFolder} />
      </DialogContent>
      <DialogActions className="dialog-actions">
        <Button className="button-cancel" onClick={() => setDialogOpen(false)}>
          Cancel
        </Button>
        <Button className="button-confirm" onClick={handleMoveToFolder}>
          Move
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AssetMoveToFolderConfirmation;
