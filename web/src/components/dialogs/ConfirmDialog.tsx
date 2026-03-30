/** @jsxImportSource @emotion/react */
import React, { useCallback, memo } from "react";
import { useNotificationStore } from "../../stores/NotificationStore";
import { Dialog } from "../ui_primitives";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  content?: React.ReactNode;
  confirmText: string;
  cancelText: string;
  notificationMessage?: string;
  notificationType?: "success" | "error" | "info";
  alert?: boolean;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = memo(function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  content,
  confirmText,
  cancelText,
  notificationMessage,
  notificationType = "info",
  alert
}) {
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const handleConfirm = useCallback(() => {
    onConfirm();
    onClose();
    if (notificationMessage) {
      addNotification({
        content: notificationMessage,
        type: notificationType,
        alert: alert
      });
    }
  }, [onConfirm, onClose, notificationMessage, addNotification, notificationType, alert]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      content={content}
      onConfirm={handleConfirm}
      onCancel={onClose}
      confirmText={confirmText}
      cancelText={cancelText}
    />
  );
});

ConfirmDialog.displayName = "ConfirmDialog";

export default ConfirmDialog;
