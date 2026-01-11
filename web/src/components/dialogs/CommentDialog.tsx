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
import useNodeCommentsStore from "../../stores/NodeCommentsStore";

interface CommentDialogProps {
  open: boolean;
  onClose: () => void;
  nodeId: string;
  nodeTitle?: string;
}

const CommentDialog: React.FC<CommentDialogProps> = ({
  open,
  onClose,
  nodeId,
  nodeTitle,
}) => {
  const theme = useTheme();
  const { getComment, addComment, updateComment, deleteComment } =
    useNodeCommentsStore();

  const existingComment = getComment(nodeId);
  const [commentText, setCommentText] = useState(existingComment?.text || "");

  const handleSave = useCallback(() => {
    if (commentText.trim()) {
      if (existingComment) {
        updateComment(nodeId, commentText);
      } else {
        addComment(nodeId, commentText);
      }
    } else if (existingComment) {
      deleteComment(nodeId);
    }
    onClose();
  }, [commentText, existingComment, nodeId, addComment, updateComment, deleteComment, onClose]);

  const handleClose = useCallback(() => {
    setCommentText(existingComment?.text || "");
    onClose();
  }, [existingComment, onClose]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        handleSave();
      }
      if (event.key === "Escape") {
        handleClose();
      }
    },
    [handleSave, handleClose]
  );

  React.useEffect(() => {
    if (open) {
      setCommentText(existingComment?.text || "");
    }
  }, [open, existingComment]);

  return (
    <Dialog
      style={{ minWidth: "400px", maxWidth: "600px" }}
      css={dialogStyles(theme)}
      className="dialog"
      open={open}
      onClose={handleClose}
      aria-labelledby="comment-dialog-title"
    >
      <DialogTitle className="dialog-title" id="comment-dialog-title">
        {existingComment ? "Edit Comment" : "Add Comment"}
        {nodeTitle && (
          <Box component="span" sx={{ ml: 1, color: "text.secondary", fontSize: "0.9em" }}>
            - {nodeTitle}
          </Box>
        )}
      </DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          multiline
          minRows={3}
          maxRows={8}
          fullWidth
          variant="outlined"
          label="Comment"
          placeholder="Add a note to document this node..."
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          onKeyDown={handleKeyDown}
          sx={{ mt: 1 }}
        />
        <Box
          component="span"
          sx={{
            display: "block",
            mt: 1,
            fontSize: "0.75rem",
            color: "text.secondary",
          }}
        >
          Press Ctrl+Enter to save, Escape to cancel
        </Box>
      </DialogContent>
      <DialogActions className="dialog-actions">
        {existingComment && (
          <Button
            className="button-cancel"
            onClick={() => {
              deleteComment(nodeId);
              onClose();
            }}
            color="error"
          >
            Delete
          </Button>
        )}
        <Button className="button-cancel" onClick={handleClose}>
          Cancel
        </Button>
        <Button
          className="button-confirm"
          onClick={handleSave}
          autoFocus
          variant={existingComment ? "contained" : "contained"}
          color={existingComment ? "primary" : "primary"}
        >
          {existingComment ? "Update" : "Add"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CommentDialog;
