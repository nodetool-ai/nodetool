/** @jsxImportSource @emotion/react */
import { useTheme } from "@mui/material/styles";
import { useNotificationStore } from "../../stores/NotificationStore";
import dialogStyles from "../../styles/DialogStyles";

import React, { useCallback } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import { DialogActionButtons } from "../ui_primitives";

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

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
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
}) => {
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const theme = useTheme();

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
    <div>
      <Dialog
        style={{ minWidth: "100%", minHeight: "100%" }}
        css={dialogStyles(theme)}
        className="dialog"
        open={open}
        onClose={onClose}
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
      >
        <DialogTitle className="dialog-title" id="confirm-dialog-title">
          {title}
        </DialogTitle>
        {content && <DialogContent>{content}</DialogContent>}
        <DialogActionButtons
          onConfirm={handleConfirm}
          onCancel={onClose}
          confirmText={confirmText}
          cancelText={cancelText}
        />
      </Dialog>
    </div>
  );
};

export default ConfirmDialog;
