/** @jsxImportSource @emotion/react */
import { useState, useCallback } from "react";
import { useTheme } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Popover from "@mui/material/Popover";
import Typography from "@mui/material/Typography";
import DeleteIcon from "@mui/icons-material/Delete";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import EditIcon from "@mui/icons-material/Edit";
import StarIcon from "@mui/icons-material/Star";
import { useNotificationStore } from "../../stores/NotificationStore";
import { NodePreset, NodePresetsStore, useNodePresetsStore } from "../../stores/NodePresetsStore";

interface NodePresetMenuProps {
  nodeType: string;
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  onApplyPreset: (properties: Record<string, unknown>) => void;
  onSavePreset: (name: string, description?: string) => void;
  hasCurrentPresets: boolean;
}

export const NodePresetMenu: React.FC<NodePresetMenuProps> = ({
  nodeType,
  anchorEl,
  open,
  onClose,
  onApplyPreset,
  onSavePreset,
  _hasCurrentPresets
}) => {
  const theme = useTheme();
  const addNotification = useNotificationStore((state) => state.addNotification);

  const presets = useNodePresetsStore((state: NodePresetsStore) =>
    state.getPresetsForNodeType(nodeType)
  );

  const deletePreset = useNodePresetsStore((state: NodePresetsStore) => state.deletePreset);
  const duplicatePreset = useNodePresetsStore((state: NodePresetsStore) => state.duplicatePreset);
  const updatePreset = useNodePresetsStore((state: NodePresetsStore) => state.updatePreset);

  const [saveAnchorEl, setSaveAnchorEl] = useState<HTMLElement | null>(null);
  const [presetName, setPresetName] = useState("");
  const [presetDescription, setPresetDescription] = useState("");
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const handleOpenSaveMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setSaveAnchorEl(event.currentTarget);
  }, []);

  const handleCloseSaveMenu = useCallback(() => {
    setSaveAnchorEl(null);
    setPresetName("");
    setPresetDescription("");
  }, []);

  const handleSavePreset = useCallback(() => {
    if (presetName.trim()) {
      onSavePreset(presetName.trim(), presetDescription.trim() || undefined);
      addNotification({
        content: `Preset "${presetName}" saved`,
        type: "success"
      });
      handleCloseSaveMenu();
    }
  }, [presetName, presetDescription, onSavePreset, addNotification, handleCloseSaveMenu]);

  const handleApplyPreset = useCallback(
    (preset: NodePreset) => {
      const properties: Record<string, unknown> = {};
      for (const prop of preset.properties) {
        properties[prop.name] = prop.value;
      }
      onApplyPreset(properties);
      addNotification({
        content: `Applied preset "${preset.name}"`,
        type: "info"
      });
      onClose();
    },
    [onApplyPreset, addNotification, onClose]
  );

  const handleDeletePreset = useCallback(
    (presetId: string, presetName: string) => {
      deletePreset(presetId);
      addNotification({
        content: `Preset "${presetName}" deleted`,
        type: "info"
      });
    },
    [deletePreset, addNotification]
  );

  const handleDuplicatePreset = useCallback(
    (presetId: string, presetName: string) => {
      const newName = `${presetName} (Copy)`;
      duplicatePreset(presetId, newName);
      addNotification({
        content: `Preset duplicated as "${newName}"`,
        type: "info"
      });
    },
    [duplicatePreset, addNotification]
  );

  const handleStartRename = useCallback((preset: NodePreset) => {
    setEditingPresetId(preset.id);
    setRenameValue(preset.name);
  }, []);

  const handleFinishRename = useCallback(
    (presetId: string) => {
      if (renameValue.trim()) {
        updatePreset(presetId, {
          name: renameValue.trim()
        });
        addNotification({
          content: `Preset renamed to "${renameValue.trim()}"`,
          type: "info"
        });
      }
      setEditingPresetId(null);
      setRenameValue("");
    },
    [renameValue, updatePreset, addNotification]
  );

  const handleCancelRename = useCallback(() => {
    setEditingPresetId(null);
    setRenameValue("");
  }, []);

  return (
    <>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={onClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left"
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "left"
        }}
        PaperProps={{
          sx: {
            minWidth: 280,
            maxWidth: 350,
            maxHeight: 400,
            overflow: "auto"
          }
        }}
      >
        <Box
          sx={{
            p: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: `1px solid ${theme.vars.palette.divider}`
          }}
        >
          <Typography variant="subtitle2" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <StarIcon fontSize="small" />
            Node Presets
          </Typography>
          <Tooltip title="Save current settings as preset">
            <IconButton size="small" onClick={handleOpenSaveMenu}>
              <StarIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        {presets.length === 0 ? (
          <Box sx={{ p: 2, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              No presets saved for this node type.
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
              Click the star icon to create a preset.
            </Typography>
          </Box>
        ) : (
          presets.map((preset: NodePreset, index: number) => (
            <Box key={preset.id}>
              {index > 0 && <Divider />}
              <MenuItem
                sx={{ py: 0.5, minHeight: 40 }}
                onClick={() => handleApplyPreset(preset)}
              >
                {editingPresetId === preset.id ? (
                  <TextField
                    size="small"
                    value={renameValue}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRenameValue(e.target.value)}
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === "Enter") {
                        handleFinishRename(preset.id);
                      } else if (e.key === "Escape") {
                        handleCancelRename();
                      }
                    }}
                    autoFocus
                    sx={{ flex: 1 }}
                  />
                ) : (
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap title={preset.name}>
                      {preset.name}
                    </Typography>
                    {preset.description && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        noWrap
                        sx={{ display: "block" }}
                      >
                        {preset.description}
                      </Typography>
                    )}
                  </Box>
                )}
                <Box sx={{ display: "flex", alignItems: "center", ml: 1 }}>
                  {editingPresetId !== preset.id && (
                    <>
                      <Tooltip title="Apply preset">
                        <IconButton
                          size="small"
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            handleApplyPreset(preset);
                          }}
                        >
                          <StarIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Rename">
                        <IconButton
                          size="small"
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            handleStartRename(preset);
                          }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Duplicate">
                        <IconButton
                          size="small"
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            handleDuplicatePreset(preset.id, preset.name);
                          }}
                        >
                          <ContentCopyIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            handleDeletePreset(preset.id, preset.name);
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                  {editingPresetId === preset.id && (
                    <>
                      <IconButton
                        size="small"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          handleFinishRename(preset.id);
                        }}
                      >
                        <StarIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          handleCancelRename();
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </>
                  )}
                </Box>
              </MenuItem>
            </Box>
          ))
        )}
      </Popover>

      <Dialog
        open={Boolean(saveAnchorEl)}
        onClose={handleCloseSaveMenu}
        aria-labelledby="save-preset-dialog-title"
      >
        <DialogTitle id="save-preset-dialog-title">
          Save Node Preset
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Preset Name"
            fullWidth
            variant="outlined"
            value={presetName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPresetName(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Description (optional)"
            fullWidth
            variant="outlined"
            multiline
            rows={2}
            value={presetDescription}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPresetDescription(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseSaveMenu}>Cancel</Button>
          <Button
            onClick={handleSavePreset}
            variant="contained"
            disabled={!presetName.trim()}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default NodePresetMenu;
