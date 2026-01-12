/** @jsxImportSource @emotion/react */
import React, { useCallback } from "react";
import { Dialog, IconButton, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import KeyboardShortcutsView from "../content/Help/KeyboardShortcutsView";

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

const KeyboardShortcutsDialog: React.FC<KeyboardShortcutsDialogProps> = ({
  open,
  onClose
}) => {
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: "background.paper",
          minHeight: "60vh",
          maxHeight: "80vh",
          position: "relative"
        }
      }}
    >
      <IconButton
        onClick={handleClose}
        sx={{
          position: "absolute",
          right: 8,
          top: 8,
          color: "text.secondary"
        }}
        aria-label="Close keyboard shortcuts"
      >
        <CloseIcon />
      </IconButton>
      <Typography
        variant="h5"
        sx={{
          p: 3,
          pb: 1,
          fontWeight: 600
        }}
      >
        Keyboard Shortcuts
      </Typography>
      <KeyboardShortcutsView />
    </Dialog>
  );
};

export default KeyboardShortcutsDialog;
