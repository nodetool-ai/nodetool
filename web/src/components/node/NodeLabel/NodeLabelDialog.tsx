/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useState, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Chip,
  IconButton,
  Typography,
  List,
  ListItem,
  ListItemSecondaryAction,
  Divider,
} from "@mui/material";
import { Delete, Edit, Add } from "@mui/icons-material";
import { useNodeLabelStore, NodeLabel } from "../../../stores/NodeLabelStore";

interface NodeLabelDialogProps {
  open: boolean;
  onClose: () => void;
  nodeId: string;
  nodeName?: string;
}

const dialogStyles = css`
  min-width: 400px;
  max-width: 500px;

  .label-input-section {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    align-items: center;
  }

  .color-options {
    display: flex;
    gap: 6px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .color-swatch {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    cursor: pointer;
    border: 2px solid transparent;
    transition: transform 0.1s ease, border-color 0.1s ease;

    &:hover {
      transform: scale(1.1);
    }

    &.selected {
      border-color: #fff;
      box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.3);
    }
  }

  .labels-list {
    max-height: 300px;
    overflow-y: auto;
  }

  .empty-state {
    text-align: center;
    padding: 24px;
    color: text.secondary;
  }
`;

const LABEL_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#6b7280",
  "#000000",
];

const NodeLabelDialog: React.FC<NodeLabelDialogProps> = memo(({ open, onClose, nodeId, nodeName }) => {
  const labels = useNodeLabelStore((state) => state.getLabels(nodeId));
  const addLabel = useNodeLabelStore((state) => state.addLabel);
  const removeLabel = useNodeLabelStore((state) => state.removeLabel);
  const updateLabel = useNodeLabelStore((state) => state.updateLabel);

  const [newLabelText, setNewLabelText] = useState("");
  const [selectedColor, setSelectedColor] = useState(LABEL_COLORS[0]);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const handleAddLabel = useCallback(() => {
    if (newLabelText.trim()) {
      addLabel(nodeId, newLabelText.trim(), selectedColor);
      setNewLabelText("");
      setSelectedColor(LABEL_COLORS[0]);
    }
  }, [nodeId, newLabelText, selectedColor, addLabel]);

  const handleRemoveLabel = useCallback(
    (labelId: string) => {
      removeLabel(nodeId, labelId);
    },
    [nodeId, removeLabel]
  );

  const handleStartEdit = useCallback((label: NodeLabel) => {
    setEditingLabelId(label.id);
    setEditText(label.text);
  }, []);

  const handleSaveEdit = useCallback(
    (labelId: string) => {
      if (editText.trim()) {
        updateLabel(nodeId, labelId, editText.trim());
      }
      setEditingLabelId(null);
      setEditText("");
    },
    [nodeId, editText, updateLabel]
  );

  const handleCancelEdit = useCallback(() => {
    setEditingLabelId(null);
    setEditText("");
  }, []);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && newLabelText.trim()) {
        handleAddLabel();
      }
    },
    [newLabelText, handleAddLabel]
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Typography variant="h6">Node Labels</Typography>
        {nodeName && (
          <Typography variant="body2" color="text.secondary">
            {nodeName}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent dividers css={dialogStyles}>
        <Box className="label-input-section">
          <TextField
            fullWidth
            size="small"
            placeholder="Add a label..."
            value={newLabelText}
            onChange={(e) => setNewLabelText(e.target.value)}
            onKeyPress={handleKeyPress}
            InputProps={{
              endAdornment: (
                <IconButton size="small" onClick={handleAddLabel} disabled={!newLabelText.trim()}>
                  <Add />
                </IconButton>
              ),
            }}
          />
        </Box>

        <Box className="color-options">
          {LABEL_COLORS.map((color) => (
            <Box
              key={color}
              className={`color-swatch ${selectedColor === color ? "selected" : ""}`}
              sx={{ backgroundColor: color }}
              onClick={() => setSelectedColor(color)}
              title={color}
            />
          ))}
        </Box>

        <Divider sx={{ my: 2 }} />

        {labels.length === 0 ? (
          <Box className="empty-state">
            <Typography variant="body2" color="text.secondary">
              No labels yet. Add one above to annotate this node.
            </Typography>
          </Box>
        ) : (
          <List className="labels-list" dense>
            {labels.map((label) => (
              <ListItem key={label.id}>
                {editingLabelId === label.id ? (
                  <TextField
                    fullWidth
                    size="small"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter") {
                        handleSaveEdit(label.id);
                      }
                    }}
                    autoFocus
                    sx={{ mr: 1 }}
                  />
                ) : (
                  <>
                    <Chip
                      label={label.text}
                      size="small"
                      sx={{
                        backgroundColor: label.color,
                        color: getContrastColor(label.color),
                        mr: 1,
                      }}
                    />
                  </>
                )}
                <ListItemSecondaryAction>
                  {editingLabelId === label.id ? (
                    <>
                      <Button size="small" onClick={() => handleSaveEdit(label.id)}>
                        Save
                      </Button>
                      <Button size="small" onClick={handleCancelEdit}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <IconButton size="small" onClick={() => handleStartEdit(label)}>
                        <Edit fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => handleRemoveLabel(label.id)}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </>
                  )}
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
});

NodeLabelDialog.displayName = "NodeLabelDialog";

function getContrastColor(hexColor: string): string {
  if (!hexColor) {
    return "#000000";
  }

  let hex = hexColor.replace("#", "");

  if (hex.length === 3) {
    hex = hex.split("").map((char) => char + char).join("");
  }

  if (hex.length !== 6) {
    return "#000000";
  }

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return "#000000";
  }

  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.5 ? "#000000" : "#FFFFFF";
}

export default NodeLabelDialog;
