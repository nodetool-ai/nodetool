/** @jsxImportSource @emotion/react */
import React, { useCallback, useState } from "react";
import FileBrowserDialog from "../dialogs/FileBrowserDialog";

const hasNativeDialog = (): boolean => {
  return typeof window !== "undefined" && window.api?.dialog !== undefined;
};

/**
 * Opens a folder picker (native in Electron, custom FileBrowserDialog otherwise)
 * and resolves with the selected absolute path or `null` when cancelled.
 */
export function useFolderPicker(): {
  pickFolder: () => Promise<string | null>;
  dialog: React.JSX.Element;
} {
  const [isOpen, setIsOpen] = useState(false);
  const [resolver, setResolver] = useState<
    ((path: string | null) => void) | null
  >(null);

  const pickFolder = useCallback(async (): Promise<string | null> => {
    if (hasNativeDialog() && window.api?.dialog) {
      try {
        const result = await window.api.dialog.openFolder({
          title: "Select Workspace Folder"
        });
        if (!result.canceled && result.filePaths.length > 0) {
          return result.filePaths[0];
        }
        return null;
      } catch {
        // Fall through to custom dialog
      }
    }
    return new Promise((resolve) => {
      setResolver(() => resolve);
      setIsOpen(true);
    });
  }, []);

  const handleConfirm = useCallback(
    (path: string) => {
      setIsOpen(false);
      resolver?.(path);
      setResolver(null);
    },
    [resolver]
  );

  const handleCancel = useCallback(() => {
    setIsOpen(false);
    resolver?.(null);
    setResolver(null);
  }, [resolver]);

  const dialog = (
    <FileBrowserDialog
      open={isOpen}
      onClose={handleCancel}
      onConfirm={handleConfirm}
      title="Select Workspace Folder"
      initialPath="~"
      selectionMode="directory"
    />
  );

  return { pickFolder, dialog };
}
