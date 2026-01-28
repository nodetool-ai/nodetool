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
  InputAdornment,
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
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic"; // Using as placeholder for weight if needed
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
  // Alignment handlers
  onAlign?: (type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
}

// Section header component
const SectionHeader: React.FC<{ title: string; action?: React.ReactNode }> = ({ title, action }) => {
  const theme = useTheme();
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1, mt: 2 }}>
      <Typography
        variant="caption"
        sx={{
          fontWeight: 600,
          color: theme.vars.palette.text.secondary,
          textTransform: "uppercase",
          letterSpacing: "0.05em"
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
  if (!onAlign) return null;
  
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2, px: 1 }}>
      <IconButton size="small" onClick={() => onAlign('left')} title="Align Left">
        <AlignHorizontalLeftIcon fontSize="small" />
      </IconButton>
      <IconButton size="small" onClick={() => onAlign('center')} title="Align Center">
        <AlignHorizontalCenterIcon fontSize="small" />
      </IconButton>
      <IconButton size="small" onClick={() => onAlign('right')} title="Align Right">
        <AlignHorizontalRightIcon fontSize="small" />
      </IconButton>
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
      <IconButton size="small" onClick={() => onAlign('top')} title="Align Top">
        <AlignVerticalTopIcon fontSize="small" />
      </IconButton>
      <IconButton size="small" onClick={() => onAlign('middle')} title="Align Middle">
        <AlignVerticalCenterIcon fontSize="small" />
      </IconButton>
      <IconButton size="small" onClick={() => onAlign('bottom')} title="Align Bottom">
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
}

const TextPropsEditor: React.FC<TextPropsEditorProps> = memo(({
  element,
  props,
  exposedInputs,
  onUpdate,
  onAddExposed,
  onRemoveExposed
}) => {
  const theme = useTheme();
  const isContentExposed = exposedInputs.some(
    (ei) => ei.elementId === element.id && ei.property === "content"
  );

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

  const handleFormatChange = (event: React.MouseEvent<HTMLElement>, newFormats: string[]) => {
    // This is a bit tricky since we store these as separate props
    // We'll just handle clicks individually for now or map them
  };

  return (
    <>
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
           <Typography variant="caption" color="text.secondary">Content</Typography>
           <IconButton
            size="small"
            onClick={toggleExposed}
            sx={{
              p: 0.5,
              color: isContentExposed
                ? theme.vars.palette.primary.main
                : theme.vars.palette.text.secondary
            }}
            title={isContentExposed ? "Remove from inputs" : "Expose as input"}
          >
            {isContentExposed ? <LinkIcon fontSize="small" /> : <LinkOffIcon fontSize="small" />}
          </IconButton>
        </Box>
        <TextField
          value={props.content}
          onChange={(e) => onUpdate({ content: e.target.value })}
          multiline
          minRows={2}
          maxRows={6}
          size="small"
          fullWidth
          variant="outlined"
          sx={{ 
            "& .MuiOutlinedInput-root": { 
              padding: 1,
              fontSize: "0.875rem"
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
        <Grid item xs={6}>
          <FormControl fullWidth size="small">
            <Select
              value={props.fontWeight}
              onChange={(e) => onUpdate({ fontWeight: e.target.value as TextProps["fontWeight"] })}
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
        <Grid item xs={6}>
          <InspectorInput
            value={props.fontSize}
            onChange={(val) => onUpdate({ fontSize: val })}
            type="number"
            min={1}
            max={500}
            icon={<TextFieldsIcon />}
          />
        </Grid>
      </Grid>

      <Grid container spacing={1} sx={{ mb: 1.5 }}>
        <Grid item xs={6}>
          <InspectorInput
            value={props.lineHeight || 1.2}
            onChange={(val) => onUpdate({ lineHeight: val })}
            type="number"
            step={0.1}
            min={0.5}
            max={3}
            icon={<HeightIcon sx={{ transform: "rotate(90deg)" }} />} // Placeholder for line height
            label="LH"
          />
        </Grid>
        <Grid item xs={6}>
          <InspectorInput
            value={props.letterSpacing || 0}
            onChange={(val) => onUpdate({ letterSpacing: val })}
            type="number"
            step={0.5}
            min={-10}
            max={50}
            icon={<CompareArrowsIcon />}
            label="LS"
          />
        </Grid>
      </Grid>

      {/* Alignment Toggles */}
      <Box sx={{ mb: 1.5 }}>
        <ToggleButtonGroup
          size="small"
          value={props.alignment}
          exclusive
          onChange={(_, val) => val && onUpdate({ alignment: val })}
          fullWidth
          sx={{ mb: 1 }}
        >
          <ToggleButton value="left"><FormatAlignLeftIcon fontSize="small" /></ToggleButton>
          <ToggleButton value="center"><FormatAlignCenterIcon fontSize="small" /></ToggleButton>
          <ToggleButton value="right"><FormatAlignRightIcon fontSize="small" /></ToggleButton>
          <ToggleButton value="justify"><FormatAlignJustifyIcon fontSize="small" /></ToggleButton>
        </ToggleButtonGroup>

        <ToggleButtonGroup
          size="small"
          value={props.verticalAlignment || "top"}
          exclusive
          onChange={(_, val) => val && onUpdate({ verticalAlignment: val })}
          fullWidth
        >
          <ToggleButton value="top"><VerticalAlignTopIcon fontSize="small" /></ToggleButton>
          <ToggleButton value="middle"><VerticalAlignCenterIcon fontSize="small" /></ToggleButton>
          <ToggleButton value="bottom"><VerticalAlignBottomIcon fontSize="small" /></ToggleButton>
        </ToggleButtonGroup>
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
}

const ImagePropsEditor: React.FC<ImagePropsEditorProps> = memo(({
  element,
  props,
  exposedInputs,
  onUpdate,
  onAddExposed,
  onRemoveExposed
}) => {
  const theme = useTheme();
  const isSourceExposed = exposedInputs.some(
    (ei) => ei.elementId === element.id && ei.property === "source"
  );

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

  return (
    <>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
        <TextField
          label="Image URL"
          value={props.source}
          onChange={(e) => onUpdate({ source: e.target.value })}
          size="small"
          fullWidth
          sx={{ mb: 1 }}
          placeholder="Enter image URL or asset ID"
        />
        <Tooltip title={isSourceExposed ? "Remove from inputs" : "Expose as input"}>
          <IconButton
            size="small"
            onClick={toggleExposed}
            sx={{
              mt: 1,
              color: isSourceExposed
                ? theme.vars.palette.primary.main
                : theme.vars.palette.text.secondary
            }}
          >
            {isSourceExposed ? <LinkIcon /> : <LinkOffIcon />}
          </IconButton>
        </Tooltip>
      </Box>

      <FormControl fullWidth size="small" sx={{ mb: 1 }}>
        <InputLabel>Fit Mode</InputLabel>
        <Select
          value={props.fit}
          label="Fit Mode"
          onChange={(e) => onUpdate({ fit: e.target.value as ImageProps["fit"] })}
        >
          <MenuItem value="contain">Contain</MenuItem>
          <MenuItem value="cover">Cover</MenuItem>
          <MenuItem value="fill">Fill</MenuItem>
        </Select>
      </FormControl>

      <Typography variant="body2" gutterBottom color="text.secondary">
        Opacity
      </Typography>
      <Slider
        value={props.opacity}
        onChange={(_, val) => onUpdate({ opacity: val as number })}
        min={0}
        max={1}
        step={0.01}
        valueLabelDisplay="auto"
        valueLabelFormat={(val) => `${Math.round(val * 100)}%`}
        sx={{ mb: 1 }}
      />
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
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1 }}>
            <Typography variant="body2" sx={{ minWidth: 60, color: "text.secondary" }}>
              Color
            </Typography>
            <ColorPicker
              color={currentShadow.color}
              onColorChange={(color) => onUpdate({ ...currentShadow, color: color || "#00000040" })}
              showCustom={true}
            />
          </Box>
          
          <Grid container spacing={1} sx={{ mb: 1 }}>
            <Grid item xs={6}>
              <InspectorInput
                label="X"
                value={currentShadow.offsetX}
                onChange={(val) => onUpdate({ ...currentShadow, offsetX: val })}
                type="number"
              />
            </Grid>
            <Grid item xs={6}>
              <InspectorInput
                label="Y"
                value={currentShadow.offsetY}
                onChange={(val) => onUpdate({ ...currentShadow, offsetY: val })}
                type="number"
              />
            </Grid>
            <Grid item xs={12}>
              <InspectorInput
                label="Blur"
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
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1 }}>
        <Typography variant="body2" sx={{ minWidth: 60, color: "text.secondary" }}>
          Fill
        </Typography>
        <ColorPicker
          color={props.fillColor}
          onColorChange={(color) => onUpdate({ fillColor: color || "#cccccc" })}
          showCustom={true}
        />
      </Box>

      <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1 }}>
        <Typography variant="body2" sx={{ minWidth: 60, color: "text.secondary" }}>
          Border
        </Typography>
        <ColorPicker
          color={props.borderColor}
          onColorChange={(color) => onUpdate({ borderColor: color || "#000000" })}
          showCustom={true}
        />
      </Box>

      <Grid container spacing={1} sx={{ mb: 1 }}>
        <Grid item xs={6}>
           <InspectorInput
            label="Width"
            value={props.borderWidth}
            onChange={(val) => onUpdate({ borderWidth: val })}
            type="number"
            min={0}
            max={50}
          />
        </Grid>
        <Grid item xs={6}>
           <InspectorInput
            label="Radius"
            value={props.borderRadius}
            onChange={(val) => onUpdate({ borderRadius: val })}
            type="number"
            min={0}
            max={100}
          />
        </Grid>
      </Grid>

      <Typography variant="body2" gutterBottom color="text.secondary">
        Opacity
      </Typography>
      <Slider
        value={props.opacity}
        onChange={(_, val) => onUpdate({ opacity: val as number })}
        min={0}
        max={1}
        step={0.01}
        valueLabelDisplay="auto"
        valueLabelFormat={(val) => `${Math.round(val * 100)}%`}
        sx={{ mb: 1 }}
      />
      
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
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1 }}>
        <Typography variant="body2" sx={{ minWidth: 60, color: "text.secondary" }}>
          Fill
        </Typography>
        <ColorPicker
          color={props.fillColor}
          onColorChange={(color) => onUpdate({ fillColor: color || "#cccccc" })}
          showCustom={true}
        />
      </Box>

      <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1 }}>
        <Typography variant="body2" sx={{ minWidth: 60, color: "text.secondary" }}>
          Border
        </Typography>
        <ColorPicker
          color={props.borderColor}
          onColorChange={(color) => onUpdate({ borderColor: color || "#000000" })}
          showCustom={true}
        />
      </Box>

      <InspectorInput
        label="Border Width"
        value={props.borderWidth}
        onChange={(val) => onUpdate({ borderWidth: val })}
        type="number"
        min={0}
        max={50}
      />

      <Typography variant="body2" gutterBottom color="text.secondary" sx={{ mt: 1 }}>
        Opacity
      </Typography>
      <Slider
        value={props.opacity}
        onChange={(_, val) => onUpdate({ opacity: val as number })}
        min={0}
        max={1}
        step={0.01}
        valueLabelDisplay="auto"
        valueLabelFormat={(val) => `${Math.round(val * 100)}%`}
        sx={{ mb: 1 }}
      />
      
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
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1 }}>
        <Typography variant="body2" sx={{ minWidth: 60, color: "text.secondary" }}>
          Stroke
        </Typography>
        <ColorPicker
          color={props.strokeColor}
          onColorChange={(color) => onUpdate({ strokeColor: color || "#000000" })}
          showCustom={true}
        />
      </Box>

      <InspectorInput
        label="Width"
        value={props.strokeWidth}
        onChange={(val) => onUpdate({ strokeWidth: val })}
        type="number"
        min={1}
        max={50}
      />

      <Typography variant="body2" gutterBottom color="text.secondary" sx={{ mt: 1 }}>
        Opacity
      </Typography>
      <Slider
        value={props.opacity}
        onChange={(_, val) => onUpdate({ opacity: val as number })}
        min={0}
        max={1}
        step={0.01}
        valueLabelDisplay="auto"
        valueLabelFormat={(val) => `${Math.round(val * 100)}%`}
        sx={{ mb: 1 }}
      />
      
      <Box sx={{ display: "flex", gap: 2, mt: 1 }}>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={props.startArrow}
              onChange={(e) => onUpdate({ startArrow: e.target.checked })}
            />
          }
          label={<Typography variant="body2">Start Arrow</Typography>}
        />
        
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={props.endArrow}
              onChange={(e) => onUpdate({ endArrow: e.target.checked })}
            />
          }
          label={<Typography variant="body2">End Arrow</Typography>}
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
          borderLeft: `1px solid ${theme.vars.palette.divider}`
        }}
      >
        <Box
          className="element-properties-header"
          sx={{
            px: 1.5,
            py: 1,
            borderBottom: `1px solid ${theme.vars.palette.divider}`,
            backgroundColor: theme.vars.palette.background.paper
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
        borderLeft: `1px solid ${theme.vars.palette.divider}`
      }}
    >
      <Box
        className="element-properties-header"
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: `1px solid ${theme.vars.palette.divider}`,
          backgroundColor: theme.vars.palette.background.paper
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
        <Grid container spacing={1} sx={{ mb: 1 }}>
          <Grid item xs={6}>
            <InspectorInput
              label="X"
              value={Math.round(element.x)}
              onChange={(val) => handleUpdateElement({ x: val })}
              type="number"
            />
          </Grid>
          <Grid item xs={6}>
            <InspectorInput
              label="Y"
              value={Math.round(element.y)}
              onChange={(val) => handleUpdateElement({ y: val })}
              type="number"
            />
          </Grid>
          <Grid item xs={6}>
            <InspectorInput
              label="W"
              value={Math.round(element.width)}
              onChange={(val) => handleUpdateElement({ width: val })}
              type="number"
              min={1}
            />
          </Grid>
          <Grid item xs={6}>
            <InspectorInput
              label="H"
              value={Math.round(element.height)}
              onChange={(val) => handleUpdateElement({ height: val })}
              type="number"
              min={1}
            />
          </Grid>
          <Grid item xs={6}>
            <InspectorInput
              label="R"
              value={Math.round(element.rotation)}
              onChange={(val) => handleUpdateElement({ rotation: val })}
              type="number"
              min={-360}
              max={360}
              adornment="°"
            />
          </Grid>
        </Grid>

        <Divider sx={{ my: 2 }} />

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
