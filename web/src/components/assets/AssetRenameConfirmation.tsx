/** @jsxImportSource @emotion/react */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "@mui/material/styles";
import { Text, Dialog, AlertBanner, EditorButton, FlexColumn, FlexRow, TextInput } from "../ui_primitives";
import { getMousePosition } from "../../utils/MousePosition";
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
  const handleClose = useCallback(() => {
    setDialogOpen(false);
  }, [setDialogOpen]);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedAssets = useAssetGridStore((state) => state.selectedAssets);
  const { refetchAssetsAndFolders } = useAssets();
  const { mutation } = useAssetUpdate();
  const theme = useTheme();
  useEffect(() => {
    if (dialogOpen) {
      setBaseNewName("");
      console.info("dialogOpen", dialogOpen);
      const mousePosition = getMousePosition();
      setDialogPosition({ x: mousePosition.x, y: mousePosition.y });

      // Use the first selected asset from store instead of fetching
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
  const objectWidth = 600;
  const leftPosition = dialogPosition.x - objectWidth;

  const safeLeft = Math.min(
    Math.max(leftPosition, 50),
    screenWidth - objectWidth - 50
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
            title={
              <span>
                {`${assets?.length} ${
                  assets?.length === 1 ? "asset" : "assets"
                }`}
                {" will be renamed to:"}
              </span>
            }
            content={
              <FlexColumn gap={2}>
                {showAlert && (
                  <AlertBanner
                    className="asset-rename-error-alert"
                    severity="success"
                    onClose={handleClose}
                  >
                    {showAlert}
                  </AlertBanner>
                )}
                <TextInput
                  className="asset-rename-input input-field"
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
                <FlexRow justify="flex-end" gap={1} fullWidth>
                  <EditorButton
                    className="asset-rename-cancel-button button-cancel"
                    onClick={handleClose}
                  >
                    Cancel
                  </EditorButton>
                  <EditorButton
                    className="asset-rename-confirm-button button-confirm"
                    onClick={handleRename}
                  >
                    Rename
                  </EditorButton>
                </FlexRow>
                {assets && assets.length > 1 && (
                  <FlexColumn className="asset-rename-notice-container" gap={0}>
                    <Text className="asset-rename-notice notice" size="small">
                      <span>Multiple assets selected:</span> <br />
                      Names will be appended with a number.
                    </Text>
                  </FlexColumn>
                )}
              </FlexColumn>
            }
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
            }}>
          </Dialog>
        </div>
      )}
    </>
  );
};

export default AssetRenameConfirmation;
