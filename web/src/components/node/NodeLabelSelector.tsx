/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useState, useCallback, useMemo } from "react";
import {
  Box,
  Button,
  Chip,
  Menu,
  MenuItem,
  TextField,
  Popover,
  IconButton,
  Typography,
  Divider,
} from "@mui/material";
import {
  Add as AddIcon,
  Label as LabelIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Check as CheckIcon,
} from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import { useNodeLabelStore, NodeLabel } from "../../stores/NodeLabelStore";

interface NodeLabelSelectorProps {
  nodeId: string;
  onLabelsChanged?: (labelIds: string[]) => void;
}

const COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#ec4899",
  "#f43f5e",
];

export const NodeLabelSelector: React.FC<NodeLabelSelectorProps> = ({
  nodeId,
  onLabelsChanged,
}) => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [newLabelAnchor, setNewLabelAnchor] = useState<null | HTMLElement>(null);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState(COLORS[0]);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const { labels, labelOrder, assignments } = useNodeLabelStore();
  const assignedLabelIds = useMemo(
    () => assignments[nodeId] || [],
    [assignments, nodeId]
  );

  const handleOpenMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleCloseMenu = useCallback(() => {
    setAnchorEl(null);
    setNewLabelAnchor(null);
    setNewLabelName("");
    setEditingLabel(null);
  }, []);

  const handleAssignLabel = useCallback(
    (labelId: string) => {
      useNodeLabelStore.getState().assignLabel(nodeId, labelId);
      const newLabelIds = [...assignedLabelIds, labelId];
      onLabelsChanged?.(newLabelIds);
    },
    [nodeId, assignedLabelIds, onLabelsChanged]
  );

  const handleRemoveLabel = useCallback(
    (labelId: string) => {
      useNodeLabelStore.getState().removeLabel(nodeId, labelId);
      const newLabelIds = assignedLabelIds.filter((id) => id !== labelId);
      onLabelsChanged?.(newLabelIds);
    },
    [nodeId, assignedLabelIds, onLabelsChanged]
  );

  const handleCreateLabel = useCallback(() => {
    if (newLabelName.trim()) {
      const id = useNodeLabelStore.getState().createLabel(
        newLabelName.trim(),
        newLabelColor
      );
      useNodeLabelStore.getState().assignLabel(nodeId, id);
      handleCloseMenu();
    }
  }, [newLabelName, newLabelColor, nodeId]);

  const handleDeleteLabel = useCallback(
    (labelId: string) => {
      useNodeLabelStore.getState().deleteLabel(labelId);
      setEditingLabel(null);
    },
    []
  );

  const handleUpdateLabel = useCallback(
    (labelId: string) => {
      if (editName.trim()) {
        const label = labels[labelId];
        if (label) {
          useNodeLabelStore.getState().updateLabel(labelId, editName.trim(), label.color);
        }
        setEditingLabel(null);
      }
    },
    [editName, labels]
  );

  const assignedLabels = useMemo(
    () => assignedLabelIds.map((id) => labels[id]).filter(Boolean),
    [assignedLabelIds, labels]
  );

  const availableLabels = useMemo(
    () => labelOrder.map((id) => labels[id]).filter(Boolean),
    [labelOrder, labels]
  );

  const unassignedLabels = useMemo(
    () => availableLabels.filter((l) => !assignedLabelIds.includes(l.id)),
    [availableLabels, assignedLabelIds]
  );

  return (
    <Box>
      {assignedLabels.length > 0 && (
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 0.5,
            mb: 1,
          }}
        >
          {assignedLabels.map((label) => (
            <Chip
              key={label.id}
              label={label.name}
              size="small"
              onDelete={() => handleRemoveLabel(label.id)}
              sx={{
                bgcolor: label.color,
                color: theme.vars.palette.getContrastText(label.color),
                "& .MuiChip-label": {
                  fontWeight: 500,
                },
                "& .MuiChip-deleteIcon": {
                  color: theme.vars.palette.getContrastText(label.color),
                  "&:hover": {
                    color:
                      theme.vars.palette.getContrastText(label.color),
                  },
                },
              }}
            />
          ))}
        </Box>
      )}

      <Button
        size="small"
        startIcon={<LabelIcon />}
        onClick={handleOpenMenu}
        variant="outlined"
        sx={{ borderRadius: 1 }}
      >
        {assignedLabels.length > 0
          ? "Edit Labels"
          : "Add Labels"}
      </Button>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleCloseMenu}
        PaperProps={{
          sx: { minWidth: 220, maxWidth: 300, p: 1 },
        }}
      >
        {assignedLabels.length > 0 && (
          <>
            <Typography
              variant="caption"
              sx={{ px: 1, color: "text.secondary" }}
            >
              Assigned Labels
            </Typography>
            {assignedLabels.map((label) => (
              <MenuItem
                key={label.id}
                sx={{
                  bgcolor: `${label.color}20`,
                  borderLeft: `3px solid ${label.color}`,
                  py: 0.5,
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    flex: 1,
                    justifyContent: "space-between",
                  }}
                >
                  {editingLabel === label.id ? (
                    <Box
                      sx={{ display: "flex", gap: 0.5, flex: 1 }}
                    >
                      <TextField
                        size="small"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleUpdateLabel(label.id);
                          }
                        }}
                        autoFocus
                        sx={{ flex: 1 }}
                      />
                      <IconButton
                        size="small"
                        onClick={() => handleUpdateLabel(label.id)}
                      >
                        <CheckIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ) : (
                    <>
                      <Typography variant="body2">{label.name}</Typography>
                      <Box sx={{ display: "flex", gap: 0.5 }}>
                        <IconButton
                          size="small"
                          onClick={() => {
                            setEditingLabel(label.id);
                            setEditName(label.name);
                          }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleRemoveLabel(label.id)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </>
                  )}
                </Box>
              </MenuItem>
            ))}
            <Divider sx={{ my: 1 }} />
          </>
        )}

        {unassignedLabels.length > 0 && (
          <>
            <Typography
              variant="caption"
              sx={{ px: 1, color: "text.secondary" }}
            >
              Available Labels
            </Typography>
            {unassignedLabels.map((label) => (
              <MenuItem
                key={label.id}
                onClick={() => handleAssignLabel(label.id)}
                sx={{ py: 0.5 }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    width: "100%",
                  }}
                >
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      bgcolor: label.color,
                    }}
                  />
                  <Typography variant="body2">{label.name}</Typography>
                </Box>
              </MenuItem>
            ))}
            <Divider sx={{ my: 1 }} />
          </>
        )}

        <MenuItem
          onClick={(e) => setNewLabelAnchor(e.currentTarget)}
          sx={{ py: 0.5 }}
        >
          <AddIcon fontSize="small" sx={{ mr: 1 }} />
          Create New Label
        </MenuItem>
      </Menu>

      <Popover
        anchorEl={newLabelAnchor}
        open={Boolean(newLabelAnchor)}
        onClose={() => {
          setNewLabelAnchor(null);
          setNewLabelName("");
        }}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left",
        }}
      >
        <Box sx={{ p: 2, minWidth: 250 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Create New Label
          </Typography>
          <TextField
            fullWidth
            size="small"
            label="Label Name"
            value={newLabelName}
            onChange={(e) => setNewLabelName(e.target.value)}
            sx={{ mb: 2 }}
            autoFocus
          />
          <Typography variant="caption" sx={{ mb: 1, display: "block" }}>
            Color
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(6, 1fr)",
              gap: 0.5,
              mb: 2,
            }}
          >
            {COLORS.map((color) => (
              <Box
                key={color}
                onClick={() => setNewLabelColor(color)}
                sx={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  bgcolor: color,
                  cursor: "pointer",
                  border:
                    newLabelColor === color
                      ? `2px solid ${theme.vars.palette.text.primary}`
                      : "none",
                  outline:
                    newLabelColor === color
                      ? `2px solid ${theme.vars.palette.text.primary}`
                      : "none",
                  outlineOffset: "1px",
                  transition: "all 0.1s",
                }}
              />
            ))}
          </Box>
          <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
            <Button
              size="small"
              onClick={() => {
                setNewLabelAnchor(null);
                setNewLabelName("");
              }}
            >
              Cancel
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={handleCreateLabel}
              disabled={!newLabelName.trim()}
            >
              Create
            </Button>
          </Box>
        </Box>
      </Popover>
    </Box>
  );
};

export default NodeLabelSelector;
