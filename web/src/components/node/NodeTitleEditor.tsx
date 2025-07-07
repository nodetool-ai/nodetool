/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useState, useCallback } from "react";
import {
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Popover
} from "@mui/material";
import { useNodes } from "../../contexts/NodeContext";

interface NodeTitleEditorProps {
  nodeId?: string;
  anchorEl: HTMLElement;
  onClose: () => void;
}
const dialogStyles = (theme: Theme) =>
  css({
    "& .MuiPaper-root": {},
    ".MuiDialogContent-root": {
      padding: "1em 1em 0 1em"
    },
    input: {
      padding: "1em"
    },
    label: {
      top: "-1em"
    },
    ".button-confirm": {
      color: "var(--palette-primary-main)",
      fontWeight: "bold"
    },
    ".button-confirm:hover": {
      backgroundColor: theme.palette.grey[900]
    },
    ".button-cancel": {
      color: theme.palette.grey[100]
    }
  });

const NodeTitleEditor: React.FC<NodeTitleEditorProps> = ({
  nodeId,
  onClose,
  anchorEl
}) => {
  const updateNodeData = useNodes((state) => state.updateNodeData);

  const [title, setTitle] = useState("");

  const handleTitleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setTitle(event.target.value);
    },
    []
  );

  const handleSave = useCallback(() => {
    if (nodeId) {
      updateNodeData(nodeId, { title });
    }
    onClose();
  }, [nodeId, onClose, title, updateNodeData]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <Popover
      css={dialogStyles}
      open={nodeId !== undefined}
      onClose={handleClose}
      anchorEl={anchorEl}
      className="dialog"
      aria-labelledby="alert-dialog-title"
      aria-describedby="alert-dialog-description"
    >
      <DialogContent>
        <TextField
          autoFocus
          label="Node Title"
          type="text"
          fullWidth
          value={title}
          onChange={handleTitleChange}
        />
      </DialogContent>
      <DialogActions>
        <Button className="button-cancel" onClick={handleClose}>
          Cancel
        </Button>
        <Button className="button-confirm" onClick={handleSave}>
          Save
        </Button>
      </DialogActions>
    </Popover>
  );
};

export default React.memo(NodeTitleEditor);
