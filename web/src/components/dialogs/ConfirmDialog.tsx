/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import ThemeNodetool from "../themes/ThemeNodetool";

import React from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import { useNotificationStore } from "../../stores/NotificationStore";
import dialogStyles from "../../styles/DialogStyles";

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

  const handleConfirm = () => {
    onConfirm();
    onClose();
    if (notificationMessage) {
      addNotification({
        content: notificationMessage,
        type: notificationType,
        alert: alert
      });
    }
  };

  return (
    <div css={dialogStyles}>
      <Dialog
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
        <DialogActions className="dialog-actions">
          <Button className="button-cancel" onClick={onClose}>
            {cancelText}
          </Button>
          <Button className="button-confirm" onClick={handleConfirm} autoFocus>
            {confirmText}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default ConfirmDialog;
