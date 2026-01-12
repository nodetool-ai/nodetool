/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useCallback, useMemo, useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useNodePresetsStore } from "../../stores/NodePresetsStore";
import useMetadataStore from "../../stores/MetadataStore";

interface SaveNodePresetDialogProps {
  open: boolean;
  onClose: () => void;
  nodeType: string;
  nodeProperties: Record<string, unknown>;
  _nodeId?: string;
}

const dialogStyles = (theme: Theme) =>
  css({
    "&": {
      minWidth: "450px"
    },
    "& .MuiPaper-root": {
      width: "100%",
      maxWidth: "450px",
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: "16px"
    },
    ".dialog-content": {
      padding: "1.5em"
    },
    ".dialog-title": {
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeNormal,
      color: theme.vars.palette.text.primary,
      padding: "1em 1.5em 0.5em"
    },
    ".dialog-actions": {
      padding: "1em 1.5em 1.5em"
    },
    ".input-field": {
      marginBottom: "1em"
    },
    ".input-field input, .input-field textarea": {
      fontFamily: theme.fontFamily1
    },
    ".preset-name": {
      color: "var(--palette-primary-main)",
      fontWeight: 600
    },
    ".node-type": {
      fontSize: "0.85rem",
      color: theme.vars.palette.text.secondary,
      marginBottom: "0.5em"
    },
    ".properties-preview": {
      backgroundColor: theme.vars.palette.action.hover,
      borderRadius: "8px",
      padding: "0.75em",
      marginTop: "0.5em",
      maxHeight: "150px",
      overflow: "auto",
      fontSize: "0.8rem",
      fontFamily: theme.fontFamily2
    },
    ".property-item": {
      display: "flex",
      justifyContent: "space-between",
      padding: "2px 0"
    },
    ".property-key": {
      color: theme.vars.palette.text.secondary
    },
    ".property-value": {
      color: theme.vars.palette.text.primary,
      fontWeight: 500
    }
  });

export const SaveNodePresetDialog: React.FC<SaveNodePresetDialogProps> = ({
  open,
  onClose,
  nodeType,
  nodeProperties
}) => {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => dialogStyles(theme), [theme]);

  const [presetName, setPresetName] = useState("");
  const [description, setDescription] = useState("");

  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const addPreset = useNodePresetsStore((state) => state.addPreset);
  const getMetadata = useMetadataStore((state) => state.getMetadata);

  const metadata = getMetadata(nodeType);
  const nodeDisplayName =
    metadata?.title || nodeType.split(".").pop() || nodeType;

  const handleSave = useCallback(() => {
    if (!presetName.trim()) {
      addNotification({
        type: "error",
        content: "Please enter a preset name",
        timeout: 3000
      });
      return;
    }

    addPreset({
      nodeType,
      name: presetName.trim(),
      description: description.trim() || undefined,
      properties: { ...nodeProperties }
    });

    addNotification({
      type: "success",
      content: `Preset "${presetName}" saved successfully`,
      timeout: 3000
    });

    onClose();
    setPresetName("");
    setDescription("");
  }, [presetName, description, nodeType, nodeProperties, addPreset, addNotification, onClose]);

  const handleClose = useCallback(() => {
    onClose();
    setPresetName("");
    setDescription("");
  }, [onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSave();
      }
    },
    [handleSave]
  );

  return (
    <Dialog
      css={memoizedStyles}
      open={open}
      onClose={handleClose}
      aria-labelledby="save-preset-dialog-title"
    >
      <DialogTitle id="save-preset-dialog-title">
        Save Node Preset
      </DialogTitle>
      <DialogContent className="dialog-content">
        <Typography className="node-type">
          Saving preset for: <span className="preset-name">{nodeDisplayName}</span>
        </Typography>
        <TextField
          className="input-field"
          fullWidth
          label="Preset Name"
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          placeholder="e.g., Claude with high temperature"
        />
        <TextField
          className="input-field"
          fullWidth
          label="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={handleKeyDown}
          multiline
          rows={2}
          placeholder="Describe when to use this preset..."
        />
        <Typography variant="caption" color="text.secondary">
          Properties that will be saved:
        </Typography>
        <Box className="properties-preview">
          {Object.entries(nodeProperties).map(([key, value]) => (
            <div key={key} className="property-item">
              <span className="property-key">{key}</span>
              <span className="property-value">
                {typeof value === "object"
                  ? JSON.stringify(value)
                  : String(value)}
              </span>
            </div>
          ))}
        </Box>
      </DialogContent>
      <DialogActions className="dialog-actions">
        <Button onClick={handleClose} className="button-cancel">
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          className="button-confirm"
          variant="contained"
          disabled={!presetName.trim()}
        >
          Save Preset
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SaveNodePresetDialog;
