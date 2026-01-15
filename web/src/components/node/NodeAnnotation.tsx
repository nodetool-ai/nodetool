import React, { useCallback, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  IconButton,
  Tooltip
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import { NodeData } from "../../stores/NodeData";
import { useNodes } from "../../contexts/NodeContext";
import useAnnotationDialogStore from "../../stores/AnnotationDialogStore";

interface NodeAnnotationEditorProps {
  nodeId: string;
  open: boolean;
  onClose: () => void;
}

export const NodeAnnotationEditor: React.FC<NodeAnnotationEditorProps> = ({
  nodeId,
  open,
  onClose
}) => {
  const { getNode } = useReactFlow();
  const updateNodeData = useNodes((state) => state.updateNodeData);
  const node = getNode(nodeId);
  const nodeData = node?.data as NodeData | undefined;
  const [annotation, setAnnotation] = useState(nodeData?.annotation || "");

  React.useEffect(() => {
    if (open) {
      setAnnotation(nodeData?.annotation || "");
    }
  }, [open, nodeData]);

  const handleSave = useCallback(() => {
    updateNodeData(nodeId, { annotation: annotation.trim() || undefined });
    onClose();
  }, [nodeId, annotation, updateNodeData, onClose]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        handleSave();
      }
      if (event.key === "Escape") {
        onClose();
      }
    },
    [handleSave, onClose]
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { borderRadius: "12px" }
      }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <EditIcon fontSize="small" />
        Edit Annotation
        <Box sx={{ flex: 1 }} />
        <IconButton onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={3}
          maxRows={8}
          placeholder="Add a note to this node... (Ctrl+Enter to save)"
          value={annotation}
          onChange={(e) => setAnnotation(e.target.value)}
          onKeyDown={handleKeyDown}
          sx={{ mt: 1 }}
          variant="outlined"
        />
        <Box sx={{ mt: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button
            size="small"
            onClick={() => setAnnotation("Use GPT-4 for better results")}
            variant="outlined"
            sx={{ fontSize: "0.7rem" }}
          >
            Use GPT-4
          </Button>
          <Button
            size="small"
            onClick={() => setAnnotation("Adjust temperature for creativity")}
            variant="outlined"
            sx={{ fontSize: "0.7rem" }}
          >
            Temperature tip
          </Button>
          <Button
            size="small"
            onClick={() => setAnnotation("TODO: Review output quality")}
            variant="outlined"
            sx={{ fontSize: "0.7rem" }}
          >
            TODO
          </Button>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button onClick={handleSave} variant="contained">
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

interface NodeAnnotationButtonProps {
  nodeId: string;
}

export const NodeAnnotationButton: React.FC<NodeAnnotationButtonProps> = ({
  nodeId
}) => {
  const { getNode } = useReactFlow();
  const node = getNode(nodeId);
  const nodeData = node?.data as NodeData | undefined;
  const hasAnnotation = Boolean(nodeData?.annotation?.trim());
  const openAnnotationDialog = useAnnotationDialogStore(
    (state) => state.openAnnotationDialog
  );

  return (
    <Tooltip title={hasAnnotation ? "Edit Annotation" : "Add Annotation"}>
      <IconButton
        className="nodrag"
        onClick={() => openAnnotationDialog(nodeId)}
        tabIndex={-1}
        size="small"
        color={hasAnnotation ? "primary" : "default"}
        sx={{
          opacity: hasAnnotation ? 1 : 0.5,
          "&:hover": { opacity: 1 }
        }}
      >
        <EditIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
};

export const AnnotationDialogContainer: React.FC = () => {
  const { isOpen, nodeId, closeAnnotationDialog } = useAnnotationDialogStore();

  if (!nodeId) {
    return null;
  }

  return (
    <NodeAnnotationEditor
      nodeId={nodeId}
      open={isOpen}
      onClose={closeAnnotationDialog}
    />
  );
};

