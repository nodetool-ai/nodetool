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
import { useNodeStore } from "../../stores/NodeStore";

interface NodeTitleEditorProps {
  nodeId?: string;
  anchorEl: HTMLElement;
  onClose: () => void;
}
const dialogStyles = (theme: any) =>
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
      color: theme.palette.c_hl1,
      fontWeight: "bold"
    },
    ".button-confirm:hover": {
      backgroundColor: theme.palette.c_gray0
    },
    ".button-cancel": {
      color: theme.palette.c_gray6
    }
  });

const NodeTitleEditor: React.FC<NodeTitleEditorProps> = ({
  nodeId,
  onClose,
  anchorEl
}) => {
  const updateNodeData = useNodeStore((state) => state.updateNodeData);

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
