/**
 * ElementProperties - Property editor panel for selected elements
 */

import React, { useCallback, memo } from "react";
import {
  Box,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Slider,
  Divider,
  IconButton,
  Tooltip,
  Switch,
  FormControlLabel,
  ToggleButton,
  ToggleButtonGroup,
  Grid
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import LinkIcon from "@mui/icons-material/Link";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
import FormatAlignCenterIcon from "@mui/icons-material/FormatAlignCenter";
import FormatAlignRightIcon from "@mui/icons-material/FormatAlignRight";
import FormatAlignJustifyIcon from "@mui/icons-material/FormatAlignJustify";
import VerticalAlignTopIcon from "@mui/icons-material/VerticalAlignTop";
import VerticalAlignCenterIcon from "@mui/icons-material/VerticalAlignCenter";
import VerticalAlignBottomIcon from "@mui/icons-material/VerticalAlignBottom";
import AlignHorizontalLeftIcon from "@mui/icons-material/AlignHorizontalLeft";
import AlignHorizontalCenterIcon from "@mui/icons-material/AlignHorizontalCenter";
import AlignHorizontalRightIcon from "@mui/icons-material/AlignHorizontalRight";
import AlignVerticalTopIcon from "@mui/icons-material/AlignVerticalTop";
import AlignVerticalCenterIcon from "@mui/icons-material/AlignVerticalCenter";
import AlignVerticalBottomIcon from "@mui/icons-material/AlignVerticalBottom";
import FormatUnderlinedIcon from "@mui/icons-material/FormatUnderlined";
import StrikethroughSIcon from "@mui/icons-material/StrikethroughS";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import HeightIcon from "@mui/icons-material/Height"; // Line height
import CompareArrowsIcon from "@mui/icons-material/CompareArrows"; // Letter spacing

import {
  LayoutElement,
  TextProps,
  ImageProps,
  RectProps,
  EllipseProps,
  LineProps,
  GroupProps,
  ExposedInput,
  ShadowEffect,
  DEFAULT_SHADOW,
  AVAILABLE_FONTS
} from "./types";
import ColorPicker from "../inputs/ColorPicker";
import { InspectorInput } from "./InspectorInput";

interface ElementPropertiesProps {
  element: LayoutElement | null;
  exposedInputs: ExposedInput[];
  onUpdateElement: (id: string, updates: Partial<LayoutElement>) => void;
  onUpdateProperties: (id: string, properties: Partial<TextProps | ImageProps | RectProps | EllipseProps | LineProps | GroupProps>) => void;
  onAddExposedInput: (input: ExposedInput) => void;
  onRemoveExposedInput: (elementId: string, property: string) => void;
  onUpdateExposedInput?: (elementId: string, property: string, updates: Partial<ExposedInput>) => void;
  // Alignment handlers
  onAlign?: (type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
}

// Type display mapping for better UX
const getTypeLabel = (inputType: ExposedInput["inputType"]) => {
  switch (inputType) {
    case "string": return "Text";
    case "image": return "Image";
    default: return "Any";
  }
};

const getTypeColor = (inputType: ExposedInput["inputType"], theme: any) => {
  switch (inputType) {
    case "string": return theme.vars.palette.success.main;
    case "image": return theme.vars.palette.info.main;
    default: return theme.vars.palette.warning.main;
  }
};

// Exposed Input Info Component - shows when a property is exposed
interface ExposedInputInfoProps {
  exposedInput: ExposedInput;
  onUpdate?: (updates: Partial<ExposedInput>) => void;
  onRemove: () => void;
}

const ExposedInputInfo: React.FC<ExposedInputInfoProps> = memo(({ exposedInput, onUpdate, onRemove }) => {
  const theme = useTheme();
  const [isEditing, setIsEditing] = React.useState(false);
  const [editName, setEditName] = React.useState(exposedInput.inputName);

  const handleSaveName = useCallback(() => {
    if (onUpdate && editName.trim() && editName !== exposedInput.inputName) {
      // Sanitize the name: lowercase, replace spaces with underscores
      const sanitizedName = editName.trim().replace(/\s+/g, "_").toLowerCase();
      onUpdate({ inputName: sanitizedName });
    }
    setIsEditing(false);
  }, [onUpdate, editName, exposedInput.inputName]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveName();
    } else if (e.key === "Escape") {
      setEditName(exposedInput.inputName);
      setIsEditing(false);
    }
  }, [handleSaveName, exposedInput.inputName]);

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        p: 0.75,
        mb: 1,
        borderRadius: 1,
        backgroundColor: theme.vars.palette.action.selected,
        border: `1px solid ${theme.vars.palette.primary.main}`,
      }}
    >
      <LinkIcon fontSize="small" sx={{ color: theme.vars.palette.primary.main, flexShrink: 0 }} />
      
      {isEditing ? (
        <TextField
          size="small"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleSaveName}
          onKeyDown={handleKeyDown}
          autoFocus
          variant="standard"
          sx={{ 
            flex: 1,
            "& .MuiInputBase-input": { 
              fontSize: "0.75rem",
              py: 0.25
            }
          }}
        />
      ) : (
        <Tooltip title="Click to edit input name">
          <Typography 
            variant="caption" 
            sx={{ 
              flex: 1, 
              cursor: onUpdate ? "pointer" : "default",
              fontFamily: "monospace",
              fontWeight: 500,
              "&:hover": onUpdate ? { textDecoration: "underline" } : {}
            }}
            onClick={() => onUpdate && setIsEditing(true)}
          >
            {exposedInput.inputName}
          </Typography>
        </Tooltip>
      )}
      
      <Box
        sx={{
          px: 0.75,
          py: 0.25,
          borderRadius: 0.5,
          backgroundColor: getTypeColor(exposedInput.inputType, theme),
          color: theme.vars.palette.common.white,
          fontSize: "0.65rem",
          fontWeight: 600,
          textTransform: "uppercase",
          flexShrink: 0
        }}
      >
        {getTypeLabel(exposedInput.inputType)}
      </Box>
      
      <Tooltip title="Remove from inputs">
        <IconButton size="small" onClick={onRemove} sx={{ p: 0.25, flexShrink: 0 }}>
          <LinkOffIcon fontSize="small" sx={{ fontSize: "1rem" }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
});
ExposedInputInfo.displayName = "ExposedInputInfo";

// Section header component
const SectionHeader: React.FC<{ title: string; action?: React.ReactNode }> = ({ title, action }) => {
  const theme = useTheme();
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5, mt: 0.5 }}>
      <Typography
        variant="caption"
        sx={{
          fontWeight: 700,
          color: theme.vars.palette.text.primary,
          fontSize: "0.75rem",
        }}
      >
        {title}
      </Typography>
      {action}
    </Box>
  );
};

// Alignment Controls Component
const AlignmentControls: React.FC<{ onAlign?: (type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void }> = ({ onAlign }) => {
  if (!onAlign) {
    return null;
  }
  
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2, px: 0.5, py: 0.5, borderRadius: 1, bgcolor: "action.hover" }}>
      <IconButton size="small" onClick={() => onAlign('left')} title="Align Left" sx={{ p: 0.5 }}>
        <AlignHorizontalLeftIcon fontSize="small" />
      </IconButton>
      <IconButton size="small" onClick={() => onAlign('center')} title="Align Center" sx={{ p: 0.5 }}>
        <AlignHorizontalCenterIcon fontSize="small" />
      </IconButton>
      <IconButton size="small" onClick={() => onAlign('right')} title="Align Right" sx={{ p: 0.5 }}>
        <AlignHorizontalRightIcon fontSize="small" />
      </IconButton>
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />
      <IconButton size="small" onClick={() => onAlign('top')} title="Align Top" sx={{ p: 0.5 }}>
        <AlignVerticalTopIcon fontSize="small" />
      </IconButton>
      <IconButton size="small" onClick={() => onAlign('middle')} title="Align Middle" sx={{ p: 0.5 }}>
        <AlignVerticalCenterIcon fontSize="small" />
      </IconButton>
      <IconButton size="small" onClick={() => onAlign('bottom')} title="Align Bottom" sx={{ p: 0.5 }}>
        <AlignVerticalBottomIcon fontSize="small" />
      </IconButton>
    </Box>
  );
};

// Text properties editor
interface TextPropsEditorProps {
  element: LayoutElement;
  props: TextProps;
  exposedInputs: ExposedInput[];
  onUpdate: (properties: Partial<TextProps>) => void;
  onAddExposed: (input: ExposedInput) => void;
  onRemoveExposed: (elementId: string, property: string) => void;
  onUpdateExposed?: (elementId: string, property: string, updates: Partial<ExposedInput>) => void;
}

const TextPropsEditor: React.FC<TextPropsEditorProps> = memo(({
  element,
  props,
  exposedInputs,
  onUpdate,
  onAddExposed,
  onRemoveExposed,
  onUpdateExposed
}) => {
  const theme = useTheme();
  const contentExposedInput = exposedInputs.find(
    (ei) => ei.elementId === element.id && ei.property === "content"
  );
  const isContentExposed = !!contentExposedInput;

  const toggleExposed = useCallback(() => {
    if (isContentExposed) {
      onRemoveExposed(element.id, "content");
    } else {
      onAddExposed({
        elementId: element.id,
        property: "content",
        inputName: element.name.replace(/\s+/g, "_").toLowerCase(),
        inputType: "string"
      });
    }
  }, [element.id, element.name, isContentExposed, onAddExposed, onRemoveExposed]);

  const handleUpdateExposed = useCallback((updates: Partial<ExposedInput>) => {
    if (onUpdateExposed) {
      onUpdateExposed(element.id, "content", updates);
    }
  }, [element.id, onUpdateExposed]);

  return (
    <>
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary">Content</Typography>
          {!isContentExposed && (
            <Tooltip title="Expose as input">
              <IconButton
                size="small"
                onClick={toggleExposed}
                sx={{
                  p: 0.5,
                  color: theme.vars.palette.text.secondary,
                  "&:hover": { color: theme.vars.palette.primary.main }
                }}
              >
                <LinkOffIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
        
        {isContentExposed && contentExposedInput && (
          <ExposedInputInfo
            exposedInput={contentExposedInput}
            onUpdate={onUpdateExposed ? handleUpdateExposed : undefined}
            onRemove={() => onRemoveExposed(element.id, "content")}
          />
        )}
        
        <TextField
          value={props.content}
          onChange={(e) => onUpdate({ content: e.target.value })}
          multiline
          minRows={2}
          maxRows={6}
          size="small"
          fullWidth
          variant="outlined"
          placeholder={isContentExposed ? "Value set via input connection" : "Enter text content"}
          sx={{ 
            "& .MuiOutlinedInput-root": { 
              padding: 1,
              fontSize: "0.875rem",
              ...(isContentExposed && {
                borderColor: theme.vars.palette.primary.main,
                backgroundColor: theme.vars.palette.action.hover
              })
            } 
          }}
        />
      </Box>

      <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
        <Select
          value={props.fontFamily}
          onChange={(e) => onUpdate({ fontFamily: e.target.value })}
          displayEmpty
          renderValue={(selected) => (
            <Box sx={{ fontFamily: selected as string }}>{selected as string}</Box>
          )}
        >
          {AVAILABLE_FONTS.map((font) => (
            <MenuItem key={font} value={font} sx={{ fontFamily: font }}>
              {font}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Grid container spacing={1} sx={{ mb: 1.5 }}>
        <Grid size={6}>
          <FormControl fullWidth size="small">
            <Select
              value={props.fontWeight}
              onChange={(e) => onUpdate({ fontWeight: e.target.value as TextProps["fontWeight"] })}
              sx={{ height: 32, fontSize: 13 }}
            >
              <MenuItem value="100">Thin</MenuItem>
              <MenuItem value="300">Light</MenuItem>
              <MenuItem value="normal">Regular</MenuItem>
              <MenuItem value="500">Medium</MenuItem>
              <MenuItem value="600">SemiBold</MenuItem>
              <MenuItem value="bold">Bold</MenuItem>
              <MenuItem value="800">ExtraBold</MenuItem>
              <MenuItem value="900">Black</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid size={6}>
          <InspectorInput
            value={props.fontSize}
            onChange={(val) => onUpdate({ fontSize: val })}
            type="number"
            min={1}
            max={500}
            icon={<TextFieldsIcon sx={{ fontSize: 16 }} />}
          />
        </Grid>
      </Grid>

      <Grid container spacing={1} sx={{ mb: 1.5 }}>
        <Grid size={6}>
          <InspectorInput
            value={props.lineHeight || 1.2}
            onChange={(val) => onUpdate({ lineHeight: val })}
            type="number"
            step={0.1}
            min={0.5}
            max={3}
            icon={<HeightIcon sx={{ transform: "rotate(90deg)", fontSize: 16 }} />}
            // label="LH"
          />
        </Grid>
        <Grid size={6}>
          <InspectorInput
            value={props.letterSpacing || 0}
            onChange={(val) => onUpdate({ letterSpacing: val })}
            type="number"
            step={0.5}
            min={-10}
            max={50}
            icon={<CompareArrowsIcon sx={{ fontSize: 16 }} />}
            // label="LS"
          />
        </Grid>
      </Grid>

      {/* Alignment Toggles */}
      <Box sx={{ mb: 1.5 }}>
        <Grid container spacing={1}>
            <Grid size={6}>
                <ToggleButtonGroup
                size="small"
                value={props.alignment}
                exclusive
                onChange={(_, val) => val && onUpdate({ alignment: val })}
                fullWidth
                sx={{ height: 32 }}
                >
                <ToggleButton value="left" sx={{ px: 1 }}><FormatAlignLeftIcon fontSize="small" /></ToggleButton>
                <ToggleButton value="center" sx={{ px: 1 }}><FormatAlignCenterIcon fontSize="small" /></ToggleButton>
                <ToggleButton value="right" sx={{ px: 1 }}><FormatAlignRightIcon fontSize="small" /></ToggleButton>
                {/* <ToggleButton value="justify"><FormatAlignJustifyIcon fontSize="small" /></ToggleButton> */}
                </ToggleButtonGroup>
            </Grid>
            <Grid size={6}>
                <ToggleButtonGroup
                size="small"
                value={props.verticalAlignment || "top"}
                exclusive
                onChange={(_, val) => val && onUpdate({ verticalAlignment: val })}
                fullWidth
                sx={{ height: 32 }}
                >
                <ToggleButton value="top" sx={{ px: 1 }}><VerticalAlignTopIcon fontSize="small" /></ToggleButton>
                <ToggleButton value="middle" sx={{ px: 1 }}><VerticalAlignCenterIcon fontSize="small" /></ToggleButton>
                <ToggleButton value="bottom" sx={{ px: 1 }}><VerticalAlignBottomIcon fontSize="small" /></ToggleButton>
                </ToggleButtonGroup>
            </Grid>
        </Grid>
      </Box>

      {/* Decoration Toggles */}
      <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
        <ToggleButton
          size="small"
          value="check"
          selected={props.textDecoration === "underline"}
          onChange={() => onUpdate({ textDecoration: props.textDecoration === "underline" ? "none" : "underline" })}
          sx={{ flex: 1 }}
        >
          <FormatUnderlinedIcon fontSize="small" />
        </ToggleButton>
        <ToggleButton
          size="small"
          value="check"
          selected={props.textDecoration === "strikethrough"}
          onChange={() => onUpdate({ textDecoration: props.textDecoration === "strikethrough" ? "none" : "strikethrough" })}
          sx={{ flex: 1 }}
        >
          <StrikethroughSIcon fontSize="small" />
        </ToggleButton>
        <ToggleButton
          size="small"
          value="check"
          selected={props.textTransform === "uppercase"}
          onChange={() => onUpdate({ textTransform: props.textTransform === "uppercase" ? "none" : "uppercase" })}
          sx={{ flex: 1 }}
        >
          <Typography variant="caption" sx={{ fontWeight: 700 }}>AA</Typography>
        </ToggleButton>
      </Box>

      <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1 }}>
        <Typography variant="body2" sx={{ minWidth: 60, color: "text.secondary" }}>
          Color
        </Typography>
        <ColorPicker
          color={props.color}
          onColorChange={(color) => onUpdate({ color: color || "#000000" })}
          showCustom={true}
        />
      </Box>
    </>
  );
});
TextPropsEditor.displayName = "TextPropsEditor";

// Image properties editor
interface ImagePropsEditorProps {
  element: LayoutElement;
  props: ImageProps;
  exposedInputs: ExposedInput[];
  onUpdate: (properties: Partial<ImageProps>) => void;
  onAddExposed: (input: ExposedInput) => void;
  onRemoveExposed: (elementId: string, property: string) => void;
  onUpdateExposed?: (elementId: string, property: string, updates: Partial<ExposedInput>) => void;
}

const ImagePropsEditor: React.FC<ImagePropsEditorProps> = memo(({
  element,
  props,
  exposedInputs,
  onUpdate,
  onAddExposed,
  onRemoveExposed,
  onUpdateExposed
}) => {
  const theme = useTheme();
  const sourceExposedInput = exposedInputs.find(
    (ei) => ei.elementId === element.id && ei.property === "source"
  );
  const isSourceExposed = !!sourceExposedInput;

  const toggleExposed = useCallback(() => {
    if (isSourceExposed) {
      onRemoveExposed(element.id, "source");
    } else {
      onAddExposed({
        elementId: element.id,
        property: "source",
        inputName: element.name.replace(/\s+/g, "_").toLowerCase(),
        inputType: "image"
      });
    }
  }, [element.id, element.name, isSourceExposed, onAddExposed, onRemoveExposed]);

  const handleUpdateExposed = useCallback((updates: Partial<ExposedInput>) => {
    if (onUpdateExposed) {
      onUpdateExposed(element.id, "source", updates);
    }
  }, [element.id, onUpdateExposed]);

  return (
    <>
      <Box sx={{ mb: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary">Image Source</Typography>
          {!isSourceExposed && (
            <Tooltip title="Expose as input">
              <IconButton
                size="small"
                onClick={toggleExposed}
                sx={{
                  p: 0.5,
                  color: theme.vars.palette.text.secondary,
                  "&:hover": { color: theme.vars.palette.primary.main }
                }}
              >
                <LinkOffIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
        
        {isSourceExposed && sourceExposedInput && (
          <ExposedInputInfo
            exposedInput={sourceExposedInput}
            onUpdate={onUpdateExposed ? handleUpdateExposed : undefined}
            onRemove={() => onRemoveExposed(element.id, "source")}
          />
        )}
        
        <TextField
          value={props.source}
          onChange={(e) => onUpdate({ source: e.target.value })}
          size="small"
          fullWidth
          placeholder={isSourceExposed ? "Value set via input connection" : "Enter image URL or asset ID"}
          sx={{
            "& .MuiOutlinedInput-root": {
              ...(isSourceExposed && {
                borderColor: theme.vars.palette.primary.main,
                backgroundColor: theme.vars.palette.action.hover
              })
            }
          }}
        />
      </Box>

      <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
        <InputLabel sx={{ fontSize: 13 }}>Fit Mode</InputLabel>
        <Select
          value={props.fit}
          label="Fit Mode"
          onChange={(e) => onUpdate({ fit: e.target.value as ImageProps["fit"] })}
          sx={{ height: 32, fontSize: 13 }}
        >
          <MenuItem value="contain">Contain</MenuItem>
          <MenuItem value="cover">Cover</MenuItem>
          <MenuItem value="fill">Fill</MenuItem>
        </Select>
      </FormControl>

      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>Opacity</Typography>
            <Typography variant="caption" color="text.secondary">{Math.round((props.opacity || 1) * 100)}%</Typography>
        </Box>
        <Slider
            size="small"
            value={props.opacity}
            onChange={(_, val) => onUpdate({ opacity: val as number })}
            min={0}
            max={1}
            step={0.01}
            sx={{ py: 1 }}
        />
      </Box>
    </>
  );
});
ImagePropsEditor.displayName = "ImagePropsEditor";

// Shadow editor component (reusable)
interface ShadowEditorProps {
  shadow?: ShadowEffect;
  onUpdate: (shadow: ShadowEffect) => void;
}

const ShadowEditor: React.FC<ShadowEditorProps> = memo(({ shadow, onUpdate }) => {
  const currentShadow = shadow || DEFAULT_SHADOW;

  const handleToggle = useCallback(() => {
    onUpdate({ ...currentShadow, enabled: !currentShadow.enabled });
  }, [currentShadow, onUpdate]);

  return (
    <Box sx={{ mt: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", textTransform: "uppercase" }}>
          Drop Shadow
        </Typography>
        <Switch
          size="small"
          checked={currentShadow.enabled}
          onChange={handleToggle}
        />
      </Box>
      
      {currentShadow.enabled && (
        <>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1.5 }}>
            <Typography variant="body2" sx={{ minWidth: 60, color: "text.secondary", fontSize: 12 }}>
              Color
            </Typography>
            <ColorPicker
              color={currentShadow.color}
              onColorChange={(color) => onUpdate({ ...currentShadow, color: color || "#00000040" })}
              showCustom={true}
            />
          </Box>
          
          <Grid container spacing={1} sx={{ mb: 1 }}>
            <Grid size={4}>
              <InspectorInput
                label="X"
                value={currentShadow.offsetX}
                onChange={(val) => onUpdate({ ...currentShadow, offsetX: val })}
                type="number"
              />
            </Grid>
            <Grid size={4}>
              <InspectorInput
                label="Y"
                value={currentShadow.offsetY}
                onChange={(val) => onUpdate({ ...currentShadow, offsetY: val })}
                type="number"
              />
            </Grid>
            <Grid size={4}>
              <InspectorInput
                label="B" // Blur
                value={currentShadow.blur}
                onChange={(val) => onUpdate({ ...currentShadow, blur: Math.max(0, val) })}
                type="number"
                min={0}
              />
            </Grid>
          </Grid>
        </>
      )}
    </Box>
  );
});
ShadowEditor.displayName = "ShadowEditor";

// Rectangle properties editor
interface RectPropsEditorProps {
  props: RectProps;
  onUpdate: (properties: Partial<RectProps>) => void;
}

const RectPropsEditor: React.FC<RectPropsEditorProps> = memo(({ props, onUpdate }) => {
  return (
    <>
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1.5 }}>
        <Typography variant="body2" sx={{ minWidth: 60, color: "text.secondary", fontSize: 12 }}>
          Fill
        </Typography>
        <ColorPicker
          color={props.fillColor}
          onColorChange={(color) => onUpdate({ fillColor: color || "#cccccc" })}
          showCustom={true}
        />
        <Typography variant="caption" sx={{ ml: 1, color: "text.secondary", fontFamily: "monospace" }}>
          {props.fillColor}
        </Typography>
      </Box>

      <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1.5 }}>
        <Typography variant="body2" sx={{ minWidth: 60, color: "text.secondary", fontSize: 12 }}>
          Border
        </Typography>
        <ColorPicker
          color={props.borderColor}
          onColorChange={(color) => onUpdate({ borderColor: color || "#000000" })}
          showCustom={true}
        />
        <Box sx={{ width: 60, ml: "auto" }}>
            <InspectorInput
                value={props.borderWidth}
                onChange={(val) => onUpdate({ borderWidth: val })}
                type="number"
                min={0}
                max={50}
                // icon={<Box sx={{ width: 10, height: 10, border: "1px solid currentColor" }} />}
            />
        </Box>
      </Box>

      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>Opacity</Typography>
            <Typography variant="caption" color="text.secondary">{Math.round((props.opacity || 1) * 100)}%</Typography>
        </Box>
        <Slider
            size="small"
            value={props.opacity}
            onChange={(_, val) => onUpdate({ opacity: val as number })}
            min={0}
            max={1}
            step={0.01}
            sx={{ py: 1 }}
        />
      </Box>
      
      <ShadowEditor
        shadow={props.shadow}
        onUpdate={(shadow) => onUpdate({ shadow })}
      />
    </>
  );
});
RectPropsEditor.displayName = "RectPropsEditor";

// Ellipse properties editor
interface EllipsePropsEditorProps {
  props: EllipseProps;
  onUpdate: (properties: Partial<EllipseProps>) => void;
}

const EllipsePropsEditor: React.FC<EllipsePropsEditorProps> = memo(({ props, onUpdate }) => {
  return (
    <>
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1.5 }}>
        <Typography variant="body2" sx={{ minWidth: 60, color: "text.secondary", fontSize: 12 }}>
          Fill
        </Typography>
        <ColorPicker
          color={props.fillColor}
          onColorChange={(color) => onUpdate({ fillColor: color || "#cccccc" })}
          showCustom={true}
        />
        <Typography variant="caption" sx={{ ml: 1, color: "text.secondary", fontFamily: "monospace" }}>
          {props.fillColor}
        </Typography>
      </Box>

      <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1.5 }}>
        <Typography variant="body2" sx={{ minWidth: 60, color: "text.secondary", fontSize: 12 }}>
          Border
        </Typography>
        <ColorPicker
          color={props.borderColor}
          onColorChange={(color) => onUpdate({ borderColor: color || "#000000" })}
          showCustom={true}
        />
        <Box sx={{ width: 60, ml: "auto" }}>
            <InspectorInput
                value={props.borderWidth}
                onChange={(val) => onUpdate({ borderWidth: val })}
                type="number"
                min={0}
                max={50}
            />
        </Box>
      </Box>

      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>Opacity</Typography>
            <Typography variant="caption" color="text.secondary">{Math.round((props.opacity || 1) * 100)}%</Typography>
        </Box>
        <Slider
            size="small"
            value={props.opacity}
            onChange={(_, val) => onUpdate({ opacity: val as number })}
            min={0}
            max={1}
            step={0.01}
            sx={{ py: 1 }}
        />
      </Box>
      
      <ShadowEditor
        shadow={props.shadow}
        onUpdate={(shadow) => onUpdate({ shadow })}
      />
    </>
  );
});
EllipsePropsEditor.displayName = "EllipsePropsEditor";

// Line properties editor
interface LinePropsEditorProps {
  props: LineProps;
  onUpdate: (properties: Partial<LineProps>) => void;
}

const LinePropsEditor: React.FC<LinePropsEditorProps> = memo(({ props, onUpdate }) => {
  return (
    <>
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1.5 }}>
        <Typography variant="body2" sx={{ minWidth: 60, color: "text.secondary", fontSize: 12 }}>
          Stroke
        </Typography>
        <ColorPicker
          color={props.strokeColor}
          onColorChange={(color) => onUpdate({ strokeColor: color || "#000000" })}
          showCustom={true}
        />
        <Box sx={{ width: 60, ml: "auto" }}>
            <InspectorInput
                value={props.strokeWidth}
                onChange={(val) => onUpdate({ strokeWidth: val })}
                type="number"
                min={1}
                max={50}
            />
        </Box>
      </Box>

      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>Opacity</Typography>
            <Typography variant="caption" color="text.secondary">{Math.round((props.opacity || 1) * 100)}%</Typography>
        </Box>
        <Slider
            size="small"
            value={props.opacity}
            onChange={(_, val) => onUpdate({ opacity: val as number })}
            min={0}
            max={1}
            step={0.01}
            sx={{ py: 1 }}
        />
      </Box>
      
      <Box sx={{ display: "flex", gap: 2, mt: 1 }}>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={props.startArrow}
              onChange={(e) => onUpdate({ startArrow: e.target.checked })}
            />
          }
          label={<Typography variant="body2" sx={{ fontSize: 12 }}>Start Arrow</Typography>}
        />
        
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={props.endArrow}
              onChange={(e) => onUpdate({ endArrow: e.target.checked })}
            />
          }
          label={<Typography variant="body2" sx={{ fontSize: 12 }}>End Arrow</Typography>}
        />
      </Box>
    </>
  );
});
LinePropsEditor.displayName = "LinePropsEditor";

// Group properties editor
interface GroupPropsEditorProps {
  props: GroupProps;
  onUpdate: (properties: Partial<GroupProps>) => void;
}

const GroupPropsEditor: React.FC<GroupPropsEditorProps> = memo(({ props, onUpdate }) => {
  return (
    <TextField
      label="Group Name"
      value={props.name}
      onChange={(e) => onUpdate({ name: e.target.value })}
      size="small"
      fullWidth
      sx={{ mb: 1 }}
    />
  );
});
GroupPropsEditor.displayName = "GroupPropsEditor";

// Main ElementProperties component
const ElementProperties: React.FC<ElementPropertiesProps> = ({
  element,
  exposedInputs,
  onUpdateElement,
  onUpdateProperties,
  onAddExposedInput,
  onRemoveExposedInput,
  onUpdateExposedInput,
  onAlign
}) => {
  const theme = useTheme();

  const handleUpdateProperties = useCallback(
    (properties: Partial<TextProps | ImageProps | RectProps | EllipseProps | LineProps | GroupProps>) => {
      if (element) {
        onUpdateProperties(element.id, properties);
      }
    },
    [element, onUpdateProperties]
  );

  const handleUpdateElement = useCallback(
    (updates: Partial<LayoutElement>) => {
      if (element) {
        onUpdateElement(element.id, updates);
      }
    },
    [element, onUpdateElement]
  );

  if (!element) {
    return (
      <Box
        className="element-properties"
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          // borderLeft removed
        }}
      >
        <Box
          className="element-properties-header"
          sx={{
            px: 1.5,
            py: 0.5,
            borderBottom: `1px solid ${theme.vars.palette.divider}`,
            backgroundColor: theme.vars.palette.background.paper,
            minHeight: 40,
            display: "flex",
            alignItems: "center"
          }}
        >
          <Typography variant="subtitle2" fontWeight={600}>
            Properties
          </Typography>
        </Box>
        <Box
          className="element-properties-empty"
          sx={{
            p: 3,
            textAlign: "center",
            color: theme.vars.palette.text.secondary
          }}
        >
          <Typography variant="body2">No element selected</Typography>
          <Typography variant="caption">
            Select an element to edit its properties
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      className="element-properties"
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        // borderLeft removed
      }}
    >
      <Box
        className="element-properties-header"
        sx={{
          px: 2,
          py: 0.5,
          borderBottom: `1px solid ${theme.vars.palette.divider}`,
          backgroundColor: theme.vars.palette.background.paper,
          minHeight: 40,
          display: "flex",
          alignItems: "center"
        }}
      >
        <Typography variant="subtitle2" fontWeight={600}>
          Properties
        </Typography>
      </Box>
      <Box
        className="element-properties-content"
        sx={{
          flexGrow: 1,
          overflow: "auto",
          p: 2
        }}
      >
        <AlignmentControls onAlign={onAlign} />

        {/* Element name */}
        <TextField
          value={element.name}
          onChange={(e) => handleUpdateElement({ name: e.target.value })}
          size="small"
          fullWidth
          variant="standard"
          sx={{ mb: 2 }}
          placeholder="Element Name"
        />

        {/* Transform properties */}
        <SectionHeader title="Layout" />
        <Grid container spacing={1} sx={{ mb: 2 }}>
          {/* Row 1: Position */}
          <Grid size={6}>
            <InspectorInput
              label="X"
              value={Math.round(element.x)}
              onChange={(val) => handleUpdateElement({ x: val })}
              type="number"
            />
          </Grid>
          <Grid size={6}>
            <InspectorInput
              label="Y"
              value={Math.round(element.y)}
              onChange={(val) => handleUpdateElement({ y: val })}
              type="number"
            />
          </Grid>
          
          {/* Row 2: Dimensions */}
          <Grid size={6}>
            <InspectorInput
              label="W"
              value={Math.round(element.width)}
              onChange={(val) => handleUpdateElement({ width: val })}
              type="number"
              min={1}
            />
          </Grid>
          <Grid size={6}>
            <InspectorInput
              label="H"
              value={Math.round(element.height)}
              onChange={(val) => handleUpdateElement({ height: val })}
              type="number"
              min={1}
            />
          </Grid>

          {/* Row 3: Rotation & Radius */}
          <Grid size={6}>
            <InspectorInput
              label="R" // Rotation
              icon={<Box component="span" sx={{ transform: "rotate(90deg)", display: "inline-block", fontSize: 14 }}>∡</Box>} // Custom icon or just label
              value={Math.round(element.rotation)}
              onChange={(val) => handleUpdateElement({ rotation: val })}
              type="number"
              min={-360}
              max={360}
              adornment="°"
            />
          </Grid>
           {/* Only show Corner Radius for rectangles */}
           {element.type === "rectangle" && (
            <Grid size={6}>
              <InspectorInput
                label="Cr"
                value={(element.properties as RectProps).borderRadius || 0}
                onChange={(val) => handleUpdateProperties({ borderRadius: val })}
                type="number"
                min={0}
                max={100}
              />
            </Grid>
          )}
        </Grid>

        <Divider sx={{ my: 2, opacity: 0.5 }} />

        {/* Type-specific properties */}
        <SectionHeader title="Style" />
        
        {element.type === "text" && (
          <TextPropsEditor
            element={element}
            props={element.properties as TextProps}
            exposedInputs={exposedInputs}
            onUpdate={handleUpdateProperties}
            onAddExposed={onAddExposedInput}
            onRemoveExposed={onRemoveExposedInput}
            onUpdateExposed={onUpdateExposedInput}
          />
        )}
        {element.type === "image" && (
          <ImagePropsEditor
            element={element}
            props={element.properties as ImageProps}
            exposedInputs={exposedInputs}
            onUpdate={handleUpdateProperties}
            onAddExposed={onAddExposedInput}
            onRemoveExposed={onRemoveExposedInput}
            onUpdateExposed={onUpdateExposedInput}
          />
        )}
        {element.type === "rectangle" && (
          <RectPropsEditor
            props={element.properties as RectProps}
            onUpdate={handleUpdateProperties}
          />
        )}
        {element.type === "ellipse" && (
          <EllipsePropsEditor
            props={element.properties as EllipseProps}
            onUpdate={handleUpdateProperties}
          />
        )}
        {element.type === "line" && (
          <LinePropsEditor
            props={element.properties as LineProps}
            onUpdate={handleUpdateProperties}
          />
        )}
        {element.type === "group" && (
          <GroupPropsEditor
            props={element.properties as GroupProps}
            onUpdate={handleUpdateProperties}
          />
        )}
      </Box>
    </Box>
  );
};

export default memo(ElementProperties);
