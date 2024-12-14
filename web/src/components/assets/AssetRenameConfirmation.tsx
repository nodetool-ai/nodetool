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
import { devLog } from "../../utils/DevLog";
import { useAssetStore } from "../../stores/AssetStore";
import dialogStyles from "../../styles/DialogStyles";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useAssetUpdate } from "../../serverState/useAssetUpdate";
import useAssets from "../../serverState/useAssets";

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
  const getAsset = useAssetStore((state) => state.get);
  const { refetchAssetsAndFolders } = useAssets();
  const { mutation } = useAssetUpdate();

  useEffect(() => {
    if (dialogOpen) {
      setBaseNewName("");
      devLog("dialogOpen", dialogOpen);
      const mousePosition = getMousePosition();
      setDialogPosition({ x: mousePosition.x, y: mousePosition.y });
      getAsset(assets[0]).then((asset) => {
        setBaseNewName(asset.name);
      });
      setShowAlert("");
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [dialogOpen, assets, getAsset]);

  const handleRename = useCallback(async () => {
    const invalidCharsRegex = /[/*?"<>|#%{}^[\]`'=&$§!°äüö;+~|$!]+/g;
    function startsWithEmoji(fileName: string): boolean {
      // Unicode range for emojis
      const emojiRegex =
        /^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      return emojiRegex.test(fileName);
    }
    // Check if the name starts with a funny character
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

    // Find invalid characters in the name
    const invalidCharsFound = baseNewName.match(invalidCharsRegex);

    // Check for empty or overly long names
    if (!baseNewName) {
      setShowAlert("Name cannot be empty.");
      return;
    } else if (baseNewName.length > 100) {
      setShowAlert("Max file name length is 100 characters.");
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

    const cleanedName = baseNewName.trim();

    // assetsToRename with incremented new names
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
  const objectWidth = 400;
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
      componentsProps={{
        backdrop: {
          style: {
            backgroundColor: "transparent"
          }
        }
      }}
      style={{
        left: `${safeLeft}px`,
        top: `${dialogPosition.y - 300}px`
      }}
    >
      <DialogTitle className="dialog-title" id="alert-dialog-title">
        <span>
          {`${assets?.length} ${assets?.length === 1 ? "asset" : "assets"}`}
        </span>
        {" will be renamed to:"}
      </DialogTitle>

      <DialogContent className="dialog-content">
        {showAlert && (
          <Alert severity="success" onClose={() => setShowAlert(null)}>
            {showAlert}
          </Alert>
        )}
        <TextField
          className="input-field"
          inputRef={inputRef}
          value={baseNewName}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleRename();
            }
          }}
          onChange={(e) => setBaseNewName(e.target.value)}
          fullWidth
          autoCorrect="off"
          spellCheck="false"
        />
      </DialogContent>
      <DialogActions className="dialog-actions">
        <Button className="button-cancel" onClick={() => setDialogOpen(false)}>
          Cancel
        </Button>
        <Button className="button-confirm" onClick={handleRename}>
          Rename
        </Button>
      </DialogActions>
      <div>
        {assets && assets.length > 1 && (
          <Typography className="notice" variant="body2">
            <span>Multiple assets selected:</span> <br />
            Names will be appended with a number.
          </Typography>
        )}
      </div>
    </Dialog>
  );
};

export default AssetRenameConfirmation;
