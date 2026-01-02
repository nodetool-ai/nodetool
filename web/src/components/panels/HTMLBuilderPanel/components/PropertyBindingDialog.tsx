/**
 * PropertyBindingDialog Component
 *
 * Dialog for binding workflow properties to HTML element attributes.
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  List,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Chip,
  Divider,
  Alert
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import NumbersIcon from "@mui/icons-material/Numbers";
import ToggleOnIcon from "@mui/icons-material/ToggleOn";
import ImageIcon from "@mui/icons-material/Image";
import VideoLibraryIcon from "@mui/icons-material/VideoLibrary";
import AudioFileIcon from "@mui/icons-material/AudioFile";
import DataObjectIcon from "@mui/icons-material/DataObject";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import { useHTMLBuilderStore } from "../../../../stores/useHTMLBuilderStore";
import type {
  PropertyBinding,
  WorkflowInput,
  NodeToolPropertyType
} from "../types/builder.types";
import { getBindableAttributes, isCompatibleType } from "../utils/propertyResolver";

/**
 * Props for PropertyBindingDialog
 */
interface PropertyBindingDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Called when dialog should close */
  onClose: () => void;
  /** The element ID to bind to */
  elementId: string | null;
  /** Pre-selected target (attribute or 'content') */
  initialTarget?: string;
}

/**
 * Get icon component for property type
 */
const getTypeIcon = (type: NodeToolPropertyType): React.ReactNode => {
  const iconMap: Record<NodeToolPropertyType, React.ReactNode> = {
    string: <TextFieldsIcon />,
    number: <NumbersIcon />,
    boolean: <ToggleOnIcon />,
    ImageRef: <ImageIcon />,
    VideoRef: <VideoLibraryIcon />,
    AudioRef: <AudioFileIcon />,
    TextRef: <TextFieldsIcon />,
    object: <DataObjectIcon />,
    array: <DataObjectIcon />,
    any: <HelpOutlineIcon />
  };
  return iconMap[type] || <HelpOutlineIcon />;
};

/**
 * PropertyBindingDialog component
 */
export const PropertyBindingDialog: React.FC<PropertyBindingDialogProps> = ({
  open,
  onClose,
  elementId,
  initialTarget
}) => {
  const theme = useTheme();

  // Local state
  const [selectedInput, setSelectedInput] = useState<WorkflowInput | null>(null);
  const [bindingType, setBindingType] = useState<PropertyBinding["bindingType"]>("content");
  const [targetAttribute, setTargetAttribute] = useState(initialTarget || "");
  const [styleProperty, setStyleProperty] = useState("");

  // Get state from store
  const elements = useHTMLBuilderStore((state) => state.elements);
  const workflowInputs = useHTMLBuilderStore((state) => state.workflowInputs);
  const bindProperty = useHTMLBuilderStore((state) => state.bindProperty);

  // Get the element being edited
  const element = elementId ? elements[elementId] : null;

  // Get bindable attributes for this element's tag
  const bindableAttributes = useMemo(() => {
    if (!element) {return [];}
    return getBindableAttributes(element.tag);
  }, [element]);

  // Filter inputs that are compatible with current selection
  const compatibleInputs = useMemo(() => {
    if (bindingType === "content") {
      // Text content accepts string types
      return workflowInputs.filter((input) =>
        isCompatibleType(input.type, ["string", "number", "any"])
      );
    }

    if (bindingType === "attribute" && targetAttribute) {
      const attr = bindableAttributes.find((a) => a.name === targetAttribute);
      if (attr) {
        return workflowInputs.filter((input) =>
          isCompatibleType(input.type, attr.types)
        );
      }
    }

    return workflowInputs;
  }, [workflowInputs, bindingType, targetAttribute, bindableAttributes]);

  // Handle input selection
  const handleInputSelect = useCallback((input: WorkflowInput) => {
    setSelectedInput(input);
  }, []);

  // Handle binding type change
  const handleBindingTypeChange = useCallback(
    (event: { target: { value: string } }) => {
      const value = event.target.value as PropertyBinding["bindingType"];
      setBindingType(value);
      setSelectedInput(null);
    },
    []
  );

  // Handle target attribute change
  const handleTargetAttributeChange = useCallback(
    (event: { target: { value: string } }) => {
      setTargetAttribute(event.target.value);
      setSelectedInput(null);
    },
    []
  );

  // Handle create binding
  const handleCreateBinding = useCallback(() => {
    if (!elementId || !selectedInput) {
      return;
    }

    const binding: PropertyBinding = {
      propertyName: selectedInput.name,
      propertyType: selectedInput.type,
      bindingType
    };

    if (bindingType === "attribute") {
      binding.attributeName = targetAttribute;
    } else if (bindingType === "style") {
      binding.styleProperty = styleProperty;
    }

    // Generate unique binding key
    const bindingKey =
      bindingType === "content"
        ? "content"
        : bindingType === "attribute"
          ? `attr:${targetAttribute}`
          : `style:${styleProperty}`;

    bindProperty(elementId, bindingKey, binding);
    onClose();

    // Reset state
    setSelectedInput(null);
    setTargetAttribute("");
    setStyleProperty("");
  }, [
    elementId,
    selectedInput,
    bindingType,
    targetAttribute,
    styleProperty,
    bindProperty,
    onClose
  ]);

  // Handle close
  const handleClose = useCallback(() => {
    setSelectedInput(null);
    setTargetAttribute("");
    setStyleProperty("");
    onClose();
  }, [onClose]);

  if (!element) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { minHeight: "60vh" }
      }}
    >
      <DialogTitle>
        Bind Property to {element.displayName || element.tag}
      </DialogTitle>

      <DialogContent dividers>
        {workflowInputs.length === 0 ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            No workflow inputs available. Add input nodes to your workflow to
            create bindable properties.
          </Alert>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {/* Binding Type Selection */}
            <FormControl fullWidth>
              <InputLabel>Binding Target</InputLabel>
              <Select
                value={bindingType}
                label="Binding Target"
                onChange={(e) => handleBindingTypeChange({ target: { value: e.target.value as string } })}
              >
                <MenuItem value="content">Text Content</MenuItem>
                <MenuItem value="attribute">HTML Attribute</MenuItem>
                <MenuItem value="style">CSS Style</MenuItem>
              </Select>
            </FormControl>

            {/* Attribute selector (when binding to attribute) */}
            {bindingType === "attribute" && (
              <FormControl fullWidth>
                <InputLabel>Attribute</InputLabel>
                <Select
                  value={targetAttribute}
                  label="Attribute"
                  onChange={(e) => handleTargetAttributeChange({ target: { value: e.target.value as string } })}
                >
                  {bindableAttributes.map((attr) => (
                    <MenuItem key={attr.name} value={attr.name}>
                      {attr.name} - {attr.description}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {/* Style property input (when binding to style) */}
            {bindingType === "style" && (
              <TextField
                label="CSS Property"
                placeholder="e.g., backgroundColor, width, color"
                value={styleProperty}
                onChange={(e) => setStyleProperty(e.target.value)}
                fullWidth
              />
            )}

            <Divider />

            {/* Workflow Input Selection */}
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Select Workflow Input
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Choose a property from your workflow to bind
              </Typography>

              {compatibleInputs.length === 0 ? (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  No compatible inputs found for this binding target.
                </Alert>
              ) : (
                <List dense sx={{ maxHeight: 250, overflow: "auto" }}>
                  {compatibleInputs.map((input) => (
                    <ListItemButton
                      key={input.name}
                      selected={selectedInput?.name === input.name}
                      onClick={() => handleInputSelect(input)}
                      sx={{
                        borderRadius: 1,
                        mb: 0.5,
                        border:
                          selectedInput?.name === input.name
                            ? `2px solid ${theme.palette.primary.main}`
                            : "2px solid transparent"
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 40 }}>
                        {getTypeIcon(input.type)}
                      </ListItemIcon>
                      <ListItemText
                        primary={input.name}
                        secondary={input.description}
                      />
                      <Chip
                        label={input.type}
                        size="small"
                        variant="outlined"
                      />
                    </ListItemButton>
                  ))}
                </List>
              )}
            </Box>

            {/* Preview */}
            {selectedInput && (
              <Box
                sx={{
                  p: 2,
                  backgroundColor: theme.palette.action.hover,
                  borderRadius: 1
                }}
              >
                <Typography variant="subtitle2" gutterBottom>
                  Binding Preview
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontFamily: "monospace", fontSize: "0.85em" }}
                >
                  {bindingType === "content"
                    ? `<${element.tag}>{{${selectedInput.name}}}</${element.tag}>`
                    : bindingType === "attribute"
                      ? `<${element.tag} ${targetAttribute}="{{${selectedInput.name}}}" />`
                      : `style="${styleProperty}: {{${selectedInput.name}}}"`}
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleCreateBinding}
          disabled={
            !selectedInput ||
            (bindingType === "attribute" && !targetAttribute) ||
            (bindingType === "style" && !styleProperty)
          }
        >
          Create Binding
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PropertyBindingDialog;
