/** @jsxImportSource @emotion/react */
import { useTheme } from "@mui/material/styles";
import dialogStyles from "../../styles/DialogStyles";

import React, { useState, useCallback } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";

interface AnnotationDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (annotation: string) => void;
  initialAnnotation?: string;
  nodeTitle?: string;
}

const AnnotationDialog: React.FC<AnnotationDialogProps> = ({
  open,
  onClose,
  onSave,
  initialAnnotation = "",
  nodeTitle
}) => {
  const theme = useTheme();
  const [annotation, setAnnotation] = useState(initialAnnotation);

  const handleSave = useCallback(() => {
    onSave(annotation.trim());
    onClose();
  }, [annotation, onSave, onClose]);

  const handleCancel = useCallback(() => {
    setAnnotation(initialAnnotation);
    onClose();
  }, [initialAnnotation, onClose]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        handleSave();
      }
      if (event.key === "Escape") {
        handleCancel();
      }
    },
    [handleSave, handleCancel]
  );

  React.useEffect(() => {
    if (open) {
      setAnnotation(initialAnnotation);
    }
  }, [open, initialAnnotation]);

  return (
    <Dialog
      style={{ minWidth: "400px", maxWidth: "600px" }}
      css={dialogStyles(theme)}
      className="dialog annotation-dialog"
      open={open}
      onClose={handleCancel}
      aria-labelledby="annotation-dialog-title"
    >
      <DialogTitle className="dialog-title" id="annotation-dialog-title">
        {nodeTitle ? `Add Note to "${nodeTitle}"` : "Add Note to Node"}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 1 }}>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={3}
            maxRows={8}
            label="Note"
            placeholder="Enter your notes about this node..."
            value={annotation}
            onChange={(e) => setAnnotation(e.target.value)}
            onKeyDown={handleKeyDown}
            variant="outlined"
            sx={{ mt: 1 }}
          />
        </Box>
      </DialogContent>
      <DialogActions className="dialog-actions">
        <Button className="button-cancel" onClick={handleCancel}>
          Cancel
        </Button>
        <Button className="button-confirm" onClick={handleSave} autoFocus>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AnnotationDialog;
