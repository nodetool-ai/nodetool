/** @jsxImportSource @emotion/react */
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import FileBrowserDialog from "../dialogs/FileBrowserDialog";

const hasNativeDialog = (): boolean => {
  return typeof window !== "undefined" && window.api?.dialog !== undefined;
};

/**
 * Opens a folder picker (native in Electron, custom FileBrowserDialog otherwise)
 * and resolves with the selected absolute path or `null` when cancelled.
 */
export function useFolderPicker() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [resolver, setResolver] = useState<
    ((path: string | null) => void) | null
  >(null);

  const pickFolder = useCallback(async (): Promise<string | null> => {
    if (hasNativeDialog() && window.api?.dialog) {
      try {
        const result = await window.api.dialog.openFolder({
          title: t("batch2_1.folderPicker.title")
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
  }, [t]);

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
      title={t("batch2_1.folderPicker.title")}
      initialPath="~"
      selectionMode="directory"
    />
  );

  return { pickFolder, dialog };
}
