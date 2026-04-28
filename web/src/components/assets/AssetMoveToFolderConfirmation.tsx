/** @jsxImportSource @emotion/react */

import { useCallback, useEffect, useState } from "react";
import { Dialog, AlertBanner, EditorButton, FlexRow, FlexColumn } from "../ui_primitives";
import { useTheme } from "@mui/material/styles";
import { getMousePosition } from "../../utils/MousePosition";
import dialogStyles from "../../styles/DialogStyles";
import FolderTree from "./FolderTree";
import { Asset } from "../../stores/ApiTypes";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useAssetUpdate } from "../../serverState/useAssetUpdate";

interface AssetMoveToFolderConfirmationProps {
  assets: string[];
}

const AssetMoveToFolderConfirmation: React.FC<
  AssetMoveToFolderConfirmationProps
> = (props) => {
  const { assets } = props;
  const [dialogPosition, setDialogPosition] = useState({ x: 0, y: 0 });
  const [showAlert, setShowAlert] = useState<string | null>(null);
  const selectedAssets = useAssetGridStore((state) => state.selectedAssets);
  const dialogOpen = useAssetGridStore((state) => state.moveToFolderDialogOpen);
  const setDialogOpen = useAssetGridStore(
    (state) => state.setMoveToFolderDialogOpen
  );
  const handleClose = useCallback(() => {
    setDialogOpen(false);
  }, [setDialogOpen]);
  const { mutation } = useAssetUpdate();
  const handleSelectFolder = useCallback(
    (folderId: string) => {
      const assetUpdates = selectedAssets.map((asset: Asset) => ({
        id: asset.id,
        parent_id: folderId
      }));
      // Close dialog immediately; optimistic update removes assets from view
      setDialogOpen(false);
      mutation.mutate(assetUpdates);
    },
    [selectedAssets, mutation, setDialogOpen]
  );

  useEffect(() => {
    if (dialogOpen) {
      const mousePosition = getMousePosition();
      setDialogPosition({ x: mousePosition.x, y: mousePosition.y });
      setShowAlert("");
    }
  }, [dialogOpen, assets]);

  const screenWidth = window.innerWidth;
  const objectWidth = 500;
  const leftPosition = dialogPosition.x - objectWidth;
  const safeLeft = Math.min(
    Math.max(leftPosition, 50),
    screenWidth - objectWidth - 50
  );
  const theme = useTheme();
  return (
    <Dialog
      css={dialogStyles(theme)}
      open={dialogOpen}
      onClose={handleClose}
      aria-labelledby="alert-dialog-title"
      aria-describedby="alert-dialog-description"
      title={
        <>
          Select new folder for &nbsp;
          <span>
            {`${assets?.length} ${assets?.length === 1 ? "asset" : "assets"}`}
          </span>
          :
        </>
      }
      content={
        <FlexColumn gap={2}>
          {showAlert && (
            <AlertBanner severity="success" onClose={() => setShowAlert(null)}>
              {showAlert}
            </AlertBanner>
          )}
          <FolderTree onSelect={handleSelectFolder} />
          <FlexRow justify="flex-end">
            <EditorButton className="button-cancel" onClick={handleClose}>
              Cancel
            </EditorButton>
          </FlexRow>
        </FlexColumn>
      }
      slotProps={{
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
        maxHeight: "600px",
        width: "500px"
      }}
    />
  );
};

export default AssetMoveToFolderConfirmation;
