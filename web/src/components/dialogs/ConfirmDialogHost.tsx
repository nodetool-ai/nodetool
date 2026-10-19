/**
 * Mounts the app-wide confirmation dialog at the root, so hooks and callbacks
 * can ask through `requestConfirm` (stores/ConfirmStore) instead of
 * `window.confirm`.
 */
import React, { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useConfirmStore } from "../../stores/ConfirmStore";
import { ConfirmDialog } from "../ui_primitives";

const ConfirmDialogHost: React.FC = () => {
  const { t } = useTranslation();
  const request = useConfirmStore((state) => state.pending?.request ?? null);
  const settle = useConfirmStore((state) => state.settle);

  const handleConfirm = useCallback(() => settle(true), [settle]);
  const handleClose = useCallback(() => settle(false), [settle]);

  if (!request) return null;
  return (
    <ConfirmDialog
      open
      onConfirm={handleConfirm}
      onClose={handleClose}
      title={request.title}
      content={request.content}
      confirmText={request.confirmText}
      cancelText={request.cancelText ?? t("batch2_12.common.cancel")}
      destructive={request.destructive}
    />
  );
};

export default memo(ConfirmDialogHost);
