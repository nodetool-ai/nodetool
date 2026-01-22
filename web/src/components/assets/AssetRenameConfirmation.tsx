/** @jsxImportSource @emotion/react */

import { useCallback, useEffect, useRef, useState } from "react";
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
import dialogStyles from "../../styles/DialogStyles";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useAssetUpdate } from "../../serverState/useAssetUpdate";
import useAssets from "../../serverState/useAssets";
import { useTheme } from "@mui/material/styles";

interface AssetRenameConfirmationProps {
  assets: string[];
}

const AssetRenameConfirmation: React.FC<AssetRenameConfirmationProps> = (
  props
) => {
  const { assets } = props;
  const setDialogOpen = useAssetGridStore((state) => state.setRenameDialogOpen);
  const dialogOpen = useAssetGridStore((state) => state.renameDialogOpen);
  const [dialogPosition, setDialogPosition] = useState({ x: 0, y: 0 });
  const [baseNewName, setBaseNewName] = useState("");
  const [showAlert, setShowAlert] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedAssets = useAssetGridStore((state) => state.selectedAssets);
  const { refetchAssetsAndFolders } = useAssets();
  const { mutation } = useAssetUpdate();
  const theme = useTheme();

  const handleClose = useCallback(() => {
    setDialogOpen(false);
  }, [setDialogOpen]);

  useEffect(() => {
    if (dialogOpen) {
      setBaseNewName("");
      log.info("dialogOpen", dialogOpen);
      const mousePosition = getMousePosition();
      setDialogPosition({ x: mousePosition.x, y: mousePosition.y });

      if (selectedAssets.length > 0) {
        setBaseNewName(selectedAssets[0].name);
      }

      setShowAlert("");
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [dialogOpen, selectedAssets]);

  const handleRename = useCallback(async () => {
    const invalidCharsRegex = /[/*?"<>|#%{}^[\]`'=&$§!°äüö;+~|$!]+/g;
    function startsWithEmoji(fileName: string): boolean {
      const emojiRegex =
        /^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      return emojiRegex.test(fileName);
    }
    if (
      startsWithEmoji(baseNewName) ||
      baseNewName.startsWith(".") ||
      baseNewName.startsWith(",") ||
      baseNewName.startsWith(" ") ||
      baseNewName.match(/^[-#*&]/)
    ) {
      setShowAlert("Name cannot start with a special character.");
      return;
    }

    const invalidCharsFound = baseNewName.match(invalidCharsRegex);

    if (!baseNewName) {
      setShowAlert("Name cannot be empty.");
      return;
    } else if (baseNewName.length > 100) {
      setShowAlert("Max file name length is 100 characters.");
      return;
    }

    if (invalidCharsFound) {
      const uniqueInvalidChars = invalidCharsFound.filter(
        (char, index, array) => array.indexOf(char) === index
      );
      setShowAlert(`Invalid characters: ${uniqueInvalidChars.join(", ")}`);
      return;
    }

    const cleanedName = baseNewName.trim();

    const maxIndexLength = Math.max(2, assets.length.toString().length);
    const updatedAssetsToRename = assets?.map((asset, index) => ({
      id: asset,
      name:
        assets.length === 1
          ? cleanedName
          : `${cleanedName}_${String(index + 1).padStart(maxIndexLength, "0")}`
    }));

    await mutation.mutateAsync(updatedAssetsToRename);
    setDialogOpen(false);
    refetchAssetsAndFolders();
  }, [baseNewName, assets, mutation, setDialogOpen, refetchAssetsAndFolders]);

  const screenWidth = window.innerWidth;
  const objectWidth = 600;
  const leftPosition = dialogPosition.x - objectWidth;

  const safeLeft = Math.min(
    Math.max(leftPosition, 50),
    screenWidth - objectWidth - 50
  );

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent) => {
      if (event.target === event.currentTarget) {
        setDialogOpen(false);
      }
    },
    [setDialogOpen]
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRename();
    }
  }, [handleRename]);

  return (
    <>
      {dialogOpen && (
        <div
          className="asset-rename-backdrop"
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
          <Dialog
            className="asset-rename-dialog"
            css={dialogStyles(theme)}
            open={dialogOpen}
            onClose={handleClose}
            aria-labelledby="alert-dialog-title"
            aria-describedby="alert-dialog-description"
            componentsProps={{
              backdrop: {
                style: {
                  backgroundColor: "transparent"
                }
              }
            }}
            PaperProps={{
              className: "asset-rename-dialog-paper",
              style: {
                backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.9)`,
                backdropFilter: "blur(10px)",
                position: "absolute",
                left: `${safeLeft}px`,
                top: `${dialogPosition.y - 300}px`,
                margin: 0
              }
            }}
          >
            <DialogTitle
              className="asset-rename-dialog-title dialog-title"
              id="alert-dialog-title"
            >
              <span>
                {`${assets?.length} ${
                  assets?.length === 1 ? "asset" : "assets"
                }`}
              </span>
              {" will be renamed to:"}
            </DialogTitle>

            <DialogContent className="asset-rename-dialog-content dialog-content">
              {showAlert && (
                <Alert
                  className="asset-rename-error-alert"
                  severity="success"
                  onClose={() => setShowAlert(null)}
                >
                  {showAlert}
                </Alert>
              )}
              <TextField
                className="asset-rename-input input-field"
                inputRef={inputRef}
                value={baseNewName}
                onKeyDown={handleKeyDown}
                onChange={(e) => setBaseNewName(e.target.value)}
                fullWidth
                autoCorrect="off"
                spellCheck="false"
              />
            </DialogContent>
            <DialogActions className="asset-rename-dialog-actions dialog-actions">
              <Button
                className="asset-rename-cancel-button button-cancel"
                onClick={handleClose}
              >
                Cancel
              </Button>
              <Button
                className="asset-rename-confirm-button button-confirm"
                onClick={handleRename}
              >
                Rename
              </Button>
            </DialogActions>
            {assets && assets.length > 1 && (
              <div className="asset-rename-notice-container">
                <Typography
                  className="asset-rename-notice notice"
                  variant="body2"
                >
                  <span>Multiple assets selected:</span> <br />
                  Names will be appended with a number.
                </Typography>
              </div>
            )}
          </Dialog>
        </div>
      )}
    </>
  );
};

export default AssetRenameConfirmation;
