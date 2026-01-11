/** @jsxImportSource @emotion/react */
import React, { useState, useCallback, useMemo } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  IconButton,
  Typography,
  Tooltip,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Menu,
  MenuItem
} from "@mui/material";
import {
  Add,
  Delete,
  Edit,
  ContentCopy,
  Palette,
  MoreVert,
  Check
} from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useNodeColorPresetsStore } from "../../stores/NodeColorPresetsStore";
import { useNodeColoring } from "../../hooks/useNodeColoring";
import { DATA_TYPES } from "../../config/data_types";

interface ColorPresetsDialogProps {
  open: boolean;
  onClose: () => void;
}

interface EditPresetState {
  id: string | null;
  name: string;
  color: string;
}

const dialogStyles = (theme: Theme) => ({
  ".MuiDialog-paper": {
    width: "400px",
    maxWidth: "90vw",
    borderRadius: 2
  },
  ".MuiDialogTitle-root": {
    backgroundColor: theme.vars.palette.grey[600],
    color: theme.vars.palette.grey[200],
    padding: "0.75em 1em"
  },
  ".MuiDialogContent-root": {
    backgroundColor: theme.vars.palette.grey[700],
    color: theme.vars.palette.grey[200],
    padding: "1em",
    minHeight: "300px"
  },
  ".MuiDialogActions-root": {
    backgroundColor: theme.vars.palette.grey[600],
    padding: "0.5em 1em"
  },
  ".preset-list": {
    padding: 0
  },
  ".preset-item": {
    borderRadius: 1,
    marginBottom: 0.5,
    "&:hover": {
      backgroundColor: theme.vars.palette.grey[500]
    }
  },
  ".preset-name-input": {
    "& .MuiOutlinedInput-root": {
      backgroundColor: theme.vars.palette.grey[600],
      color: theme.vars.palette.grey[200],
      "& fieldset": {
        borderColor: theme.vars.palette.grey[400]
      },
      "&:hover fieldset": {
        borderColor: theme.vars.palette.grey[300]
      },
      "&.Mui-focused fieldset": {
        borderColor: theme.vars.palette.primary.main
      }
    },
    "& .MuiInputBase-input": {
      color: theme.vars.palette.grey[200]
    }
  }
});

const ColorPresetsDialog: React.FC<ColorPresetsDialogProps> = ({
  open,
  onClose
}) => {
  const theme = useTheme();
  const presets = useNodeColorPresetsStore((state) => state.presets);
  const addPreset = useNodeColorPresetsStore((state) => state.addPreset);
  const removePreset = useNodeColorPresetsStore((state) => state.removePreset);
  const updatePreset = useNodeColorPresetsStore((state) => state.updatePreset);
  const duplicatePreset = useNodeColorPresetsStore((state) => state.duplicatePreset);
  const { saveSelectedColorAsPreset, hasSelectedNodes } = useNodeColoring();

  const [newPresetName, setNewPresetName] = useState("");
  const [editingPreset, setEditingPreset] = useState<EditPresetState | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [menuPresetId, setMenuPresetId] = useState<string | null>(null);

  const handleAddPreset = useCallback(() => {
    if (newPresetName.trim()) {
      const defaultColor = "#3B82F6";
      addPreset(newPresetName.trim(), defaultColor);
      setNewPresetName("");
    }
  }, [newPresetName, addPreset]);

  const handleSaveSelectedAsPreset = useCallback(() => {
    if (newPresetName.trim() && hasSelectedNodes) {
      saveSelectedColorAsPreset(newPresetName.trim());
      setNewPresetName("");
    }
  }, [newPresetName, hasSelectedNodes, saveSelectedColorAsPreset]);

  const handleStartEdit = useCallback((presetId: string) => {
    const preset = presets.find((p) => p.id === presetId);
    if (preset) {
      setEditingPreset({
        id: preset.id,
        name: preset.name,
        color: preset.color
      });
    }
    setAnchorEl(null);
    setMenuPresetId(null);
  }, [presets]);

  const handleCancelEdit = useCallback(() => {
    setEditingPreset(null);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (editingPreset && editingPreset.id && editingPreset.name.trim()) {
      updatePreset(editingPreset.id, editingPreset.name, editingPreset.color || "#3B82F6");
      setEditingPreset(null);
    }
  }, [editingPreset, updatePreset]);

  const handleDelete = useCallback((presetId: string) => {
    removePreset(presetId);
    setAnchorEl(null);
    setMenuPresetId(null);
  }, [removePreset]);

  const handleDuplicate = useCallback((presetId: string) => {
    duplicatePreset(presetId);
    setAnchorEl(null);
    setMenuPresetId(null);
  }, [duplicatePreset]);

  const handleMenuOpen = useCallback((event: React.MouseEvent<HTMLElement>, presetId: string) => {
    setAnchorEl(event.currentTarget);
    setMenuPresetId(presetId);
  }, []);

  const handleMenuClose = useCallback(() => {
    setAnchorEl(null);
    setMenuPresetId(null);
  }, []);

  const colorOptions = useMemo(() => {
    return DATA_TYPES.slice(0, 12).map((dt) => dt.color);
  }, []);

  const handleColorSelect = useCallback((color: string, isEditing: boolean) => {
    if (isEditing && editingPreset) {
      setEditingPreset({ ...editingPreset, color });
    }
  }, [editingPreset]);

  const presetButtons = useMemo(() => {
    return colorOptions.map((color, index) => (
      <Tooltip key={`color-${index}`} title={color} arrow>
        <IconButton
          size="small"
          onClick={() => handleColorSelect(color, false)}
          sx={{
            width: 28,
            height: 28,
            backgroundColor: color,
            border: 1,
            borderColor: "grey.400",
            "&:hover": {
              backgroundColor: color,
              opacity: 0.8
            }
          }}
        />
      </Tooltip>
    ));
  }, [colorOptions, handleColorSelect]);

  const renderPresetItem = useCallback((preset: typeof presets[0]) => {
    const isEditing = editingPreset?.id === preset.id;

    return (
      <ListItem
        key={preset.id}
        className="preset-item"
        secondaryAction={
          isEditing ? (
            <Box sx={{ display: "flex", gap: 0.5 }}>
              <IconButton size="small" onClick={handleSaveEdit}>
                <Check fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={handleCancelEdit}>
                <Delete fontSize="small" />
              </IconButton>
            </Box>
          ) : (
            <IconButton
              size="small"
              onClick={(e) => handleMenuOpen(e, preset.id)}
            >
              <MoreVert fontSize="small" />
            </IconButton>
          )
        }
      >
        <ListItemAvatar>
          <Avatar
            sx={{
              backgroundColor: preset.color,
              width: 32,
              height: 32,
              border: 1,
              borderColor: "grey.400"
            }}
          />
        </ListItemAvatar>
        {isEditing ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1, width: "100%" }}>
            <TextField
              className="preset-name-input"
              fullWidth
              size="small"
              value={editingPreset.name}
              onChange={(e) =>
                setEditingPreset({ ...editingPreset, name: e.target.value })
              }
              placeholder="Preset name"
              autoFocus
            />
            <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
              {colorOptions.map((color, idx) => (
                <Tooltip key={`edit-color-${idx}`} title={color} arrow>
                  <IconButton
                    size="small"
                    onClick={() => handleColorSelect(color, true)}
                    sx={{
                      width: 24,
                      height: 24,
                      backgroundColor: color,
                      border: editingPreset.color === color ? 2 : 1,
                      borderColor: editingPreset.color === color ? "primary.main" : "grey.400",
                      "&:hover": {
                        backgroundColor: color,
                        opacity: 0.8
                      }
                    }}
                  />
                </Tooltip>
              ))}
            </Box>
          </Box>
        ) : (
          <ListItemText
            primary={preset.name}
            secondary={preset.color}
            primaryTypographyProps={{
              color: "grey.200",
              fontSize: "0.9rem"
            }}
            secondaryTypographyProps={{
              color: "grey.400",
              fontSize: "0.75rem"
            }}
          />
        )}
      </ListItem>
    );
  }, [editingPreset, colorOptions, handleMenuOpen, handleColorSelect, handleSaveEdit, handleCancelEdit]);

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Palette />
          <Typography variant="h6">Color Presets</Typography>
        </Box>
      </DialogTitle>
      <DialogContent css={dialogStyles(theme)}>
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" color="grey.300" gutterBottom>
            Create New Preset
          </Typography>
          <Box sx={{ display: "flex", gap: 1, mb: 1 }}>
            <TextField
              className="preset-name-input"
              fullWidth
              size="small"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              placeholder={
                hasSelectedNodes
                  ? "Name for selected node's color..."
                  : "New preset name..."
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (hasSelectedNodes) {
                    handleSaveSelectedAsPreset();
                  } else {
                    handleAddPreset();
                  }
                }
              }}
            />
            <Button
              variant="contained"
              size="small"
              onClick={hasSelectedNodes ? handleSaveSelectedAsPreset : handleAddPreset}
              disabled={!newPresetName.trim()}
            >
              <Add />
            </Button>
          </Box>
          {hasSelectedNodes && (
            <Typography variant="caption" color="grey.400">
              Preset will use the color from the first selected node
            </Typography>
          )}
        </Box>

        <Typography variant="subtitle2" color="grey.300" gutterBottom>
          Quick Colors
        </Typography>
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mb: 2 }}>
          {presetButtons}
        </Box>

        <Typography variant="subtitle2" color="grey.300" gutterBottom>
          Saved Presets ({presets.length})
        </Typography>
        <List className="preset-list">
          {presets.map(renderPresetItem)}
        </List>
        {presets.length === 0 && (
          <Typography
            variant="body2"
            color="grey.400"
            align="center"
            sx={{ mt: 2 }}
          >
            No presets saved yet. Create one above!
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem
          onClick={() => menuPresetId && handleStartEdit(menuPresetId)}
        >
          <Edit fontSize="small" sx={{ mr: 1 }} />
          Edit
        </MenuItem>
        <MenuItem
          onClick={() => menuPresetId && handleDuplicate(menuPresetId)}
        >
          <ContentCopy fontSize="small" sx={{ mr: 1 }} />
          Duplicate
        </MenuItem>
        <MenuItem
          onClick={() => menuPresetId && handleDelete(menuPresetId)}
          sx={{ color: "error.main" }}
        >
          <Delete fontSize="small" sx={{ mr: 1 }} />
          Delete
        </MenuItem>
      </Menu>
    </Dialog>
  );
};

export default ColorPresetsDialog;
