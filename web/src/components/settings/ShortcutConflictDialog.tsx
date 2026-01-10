/** @jsxImportSource @emotion/react */
import React, { useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Alert
} from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

interface ShortcutConflictDialogProps {
  open: boolean;
  conflicts: Array<{ slug: string; title: string }>;
  onClose: () => void;
  onResolve: (overwrite: boolean) => void;
}

const ShortcutConflictDialog: React.FC<ShortcutConflictDialogProps> = ({
  open,
  conflicts,
  onClose,
  onResolve
}) => {
  const handleOverwrite = useCallback(() => {
    onResolve(true);
  }, [onResolve]);

  const handleCancel = useCallback(() => {
    onResolve(false);
  }, [onResolve]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <WarningAmberIcon color="warning" />
        Keyboard Shortcut Conflict
      </DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          The shortcut you are trying to set conflicts with the following
          existing custom shortcuts:
        </Alert>
        <Box sx={{ mb: 2 }}>
          {conflicts.map((conflict, index) => (
            <Typography key={index} variant="body2" sx={{ py: 0.5 }}>
              • {conflict.slug || conflict.title}
            </Typography>
          ))}
        </Box>
        <Typography variant="body2" color="text.secondary">
          You can either:
          <br />
          • <strong>Overwrite:</strong> Remove the conflicting shortcuts and keep
          your new shortcut
          <br />
          • <strong>Cancel:</strong> Keep the existing shortcuts and do not apply
          your new shortcut
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel}>Cancel</Button>
        <Button variant="contained" color="warning" onClick={handleOverwrite}>
          Overwrite Conflicts
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ShortcutConflictDialog;
