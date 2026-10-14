import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertBanner,
  Dialog,
  FlexColumn,
  SPACING,
  TextInput
} from "../ui_primitives";
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
  const [baseNewName, setBaseNewName] = useState("");
  const [showAlert, setShowAlert] = useState<string | null>(null);
  const handleClose = useCallback(() => {
    setDialogOpen(false);
  }, [setDialogOpen]);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedAssets = useAssetGridStore((state) => state.selectedAssets);
  const { refetchAssetsAndFolders } = useAssets();
  const { mutation } = useAssetUpdate();
  useEffect(() => {
    if (dialogOpen) {
      setBaseNewName("");
      console.info("dialogOpen", dialogOpen);

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

  const count = assets?.length ?? 0;
  return (
    <Dialog
      className="asset-rename-dialog"
      open={dialogOpen}
      onClose={handleClose}
      maxWidth="xs"
      fullWidth
      title={count === 1 ? "Rename asset" : `Rename ${count} assets`}
      onConfirm={() => void handleRename()}
      confirmText="Rename"
      actionButtonsProps={{
        className: "asset-rename-actions",
        confirmButtonProps: {
          className: "asset-rename-confirm-button button-confirm"
        },
        cancelButtonProps: {
          className: "asset-rename-cancel-button button-cancel"
        }
      }}
    >
      <FlexColumn gap={SPACING.md}>
        {showAlert && (
          <AlertBanner
            className="asset-rename-error-alert"
            severity="error"
            onClose={() => setShowAlert(null)}
          >
            {showAlert}
          </AlertBanner>
        )}
        <TextInput
          className="asset-rename-input input-field"
          label="Name"
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
          helperText={
            count > 1
              ? "Multiple assets selected: names will be appended with a number."
              : undefined
          }
        />
      </FlexColumn>
    </Dialog>
  );
};

export default AssetRenameConfirmation;
