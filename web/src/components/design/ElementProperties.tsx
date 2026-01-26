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
  FormControlLabel
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import LinkIcon from "@mui/icons-material/Link";
import LinkOffIcon from "@mui/icons-material/LinkOff";
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

interface ElementPropertiesProps {
  element: LayoutElement | null;
  exposedInputs: ExposedInput[];
  onUpdateElement: (id: string, updates: Partial<LayoutElement>) => void;
  onUpdateProperties: (id: string, properties: Partial<TextProps | ImageProps | RectProps | EllipseProps | LineProps | GroupProps>) => void;
  onAddExposedInput: (input: ExposedInput) => void;
  onRemoveExposedInput: (elementId: string, property: string) => void;
}

// Section header component
const SectionHeader: React.FC<{ title: string }> = ({ title }) => {
  const theme = useTheme();
  return (
    <Typography
      variant="caption"
      sx={{
        display: "block",
        fontWeight: 600,
        color: theme.vars.palette.text.secondary,
        mb: 1,
        mt: 2,
        textTransform: "uppercase",
        letterSpacing: "0.05em"
      }}
    >
      {title}
    </Typography>
  );
};

// Number input field
interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  adornment?: string;
}

const NumberField: React.FC<NumberFieldProps> = memo(({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  adornment
}) => {
  return (
    <TextField
      label={label}
      type="number"
      size="small"
      value={value}
      onChange={(e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) {
          const clampedVal = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, val));
          onChange(clampedVal);
        }
      }}
      inputProps={{ min, max, step }}
      InputProps={
        adornment
          ? {
              endAdornment: (
                <InputAdornment position="end">{adornment}</InputAdornment>
              )
            }
          : undefined
      }
      fullWidth
      sx={{ mb: 1 }}
    />
  );
});
NumberField.displayName = "NumberField";

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

  return (
    <>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
        <TextField
          label="Content"
          value={props.content}
          onChange={(e) => onUpdate({ content: e.target.value })}
          multiline
          rows={3}
          size="small"
          fullWidth
          sx={{ mb: 1 }}
        />
        <Tooltip title={isContentExposed ? "Remove from inputs" : "Expose as input"}>
          <IconButton
            size="small"
            onClick={toggleExposed}
            sx={{
              mt: 1,
              color: isContentExposed
                ? theme.vars.palette.primary.main
                : theme.vars.palette.text.secondary
            }}
          >
            {isContentExposed ? <LinkIcon /> : <LinkOffIcon />}
          </IconButton>
        </Tooltip>
      </Box>

      <FormControl fullWidth size="small" sx={{ mb: 1 }}>
        <InputLabel>Font Family</InputLabel>
        <Select
          value={props.fontFamily}
          label="Font Family"
          onChange={(e) => onUpdate({ fontFamily: e.target.value })}
        >
          {AVAILABLE_FONTS.map((font) => (
            <MenuItem key={font} value={font} sx={{ fontFamily: font }}>
              {font}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Box sx={{ display: "flex", gap: 1 }}>
        <NumberField
          label="Font Size"
          value={props.fontSize}
          onChange={(val) => onUpdate({ fontSize: val })}
          min={8}
          max={200}
          adornment="px"
        />
        <FormControl fullWidth size="small" sx={{ mb: 1 }}>
          <InputLabel>Weight</InputLabel>
          <Select
            value={props.fontWeight}
            label="Weight"
            onChange={(e) => onUpdate({ fontWeight: e.target.value as TextProps["fontWeight"] })}
          >
            <MenuItem value="100">Thin (100)</MenuItem>
            <MenuItem value="200">Extra Light (200)</MenuItem>
            <MenuItem value="300">Light (300)</MenuItem>
            <MenuItem value="normal">Normal (400)</MenuItem>
            <MenuItem value="500">Medium (500)</MenuItem>
            <MenuItem value="600">Semi Bold (600)</MenuItem>
            <MenuItem value="bold">Bold (700)</MenuItem>
            <MenuItem value="800">Extra Bold (800)</MenuItem>
            <MenuItem value="900">Black (900)</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1 }}>
        <Typography variant="body2" sx={{ minWidth: 60 }}>
          Color
        </Typography>
        <ColorPicker
          color={props.color}
          onColorChange={(color) => onUpdate({ color: color || "#000000" })}
          showCustom={true}
        />
      </Box>

      <Box sx={{ display: "flex", gap: 1 }}>
        <FormControl fullWidth size="small" sx={{ mb: 1 }}>
          <InputLabel>Horizontal</InputLabel>
          <Select
            value={props.alignment}
            label="Horizontal"
            onChange={(e) => onUpdate({ alignment: e.target.value as TextProps["alignment"] })}
          >
            <MenuItem value="left">Left</MenuItem>
            <MenuItem value="center">Center</MenuItem>
            <MenuItem value="right">Right</MenuItem>
          </Select>
        </FormControl>
        <FormControl fullWidth size="small" sx={{ mb: 1 }}>
          <InputLabel>Vertical</InputLabel>
          <Select
            value={props.verticalAlignment || "top"}
            label="Vertical"
            onChange={(e) => onUpdate({ verticalAlignment: e.target.value as TextProps["verticalAlignment"] })}
          >
            <MenuItem value="top">Top</MenuItem>
            <MenuItem value="middle">Middle</MenuItem>
            <MenuItem value="bottom">Bottom</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <Box sx={{ display: "flex", gap: 1 }}>
        <NumberField
          label="Line Height"
          value={props.lineHeight}
          onChange={(val) => onUpdate({ lineHeight: val })}
          min={0.5}
          max={3}
          step={0.1}
        />
        <NumberField
          label="Letter Spacing"
          value={props.letterSpacing || 0}
          onChange={(val) => onUpdate({ letterSpacing: val })}
          min={-5}
          max={20}
          step={0.5}
          adornment="px"
        />
      </Box>

      <Box sx={{ display: "flex", gap: 1 }}>
        <FormControl fullWidth size="small" sx={{ mb: 1 }}>
          <InputLabel>Decoration</InputLabel>
          <Select
            value={props.textDecoration || "none"}
            label="Decoration"
            onChange={(e) => onUpdate({ textDecoration: e.target.value as TextProps["textDecoration"] })}
          >
            <MenuItem value="none">None</MenuItem>
            <MenuItem value="underline">Underline</MenuItem>
            <MenuItem value="strikethrough">Strikethrough</MenuItem>
          </Select>
        </FormControl>
        <FormControl fullWidth size="small" sx={{ mb: 1 }}>
          <InputLabel>Transform</InputLabel>
          <Select
            value={props.textTransform || "none"}
            label="Transform"
            onChange={(e) => onUpdate({ textTransform: e.target.value as TextProps["textTransform"] })}
          >
            <MenuItem value="none">None</MenuItem>
            <MenuItem value="uppercase">UPPERCASE</MenuItem>
            <MenuItem value="lowercase">lowercase</MenuItem>
            <MenuItem value="capitalize">Capitalize</MenuItem>
          </Select>
        </FormControl>
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

      <Typography variant="body2" gutterBottom>
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
  // theme reserved for future styling enhancements
  const _theme = useTheme();
  const currentShadow = shadow || DEFAULT_SHADOW;

  const handleToggle = useCallback(() => {
    onUpdate({ ...currentShadow, enabled: !currentShadow.enabled });
  }, [currentShadow, onUpdate]);

  return (
    <Box sx={{ mt: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
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
            <Typography variant="body2" sx={{ minWidth: 60 }}>
              Color
            </Typography>
            <ColorPicker
              color={currentShadow.color}
              onColorChange={(color) => onUpdate({ ...currentShadow, color: color || "#00000040" })}
              showCustom={true}
            />
          </Box>
          
          <Box sx={{ display: "flex", gap: 1, mb: 1 }}>
            <TextField
              label="X"
              type="number"
              value={currentShadow.offsetX}
              onChange={(e) => onUpdate({ ...currentShadow, offsetX: parseInt(e.target.value) || 0 })}
              size="small"
              sx={{ flex: 1 }}
              InputProps={{ endAdornment: <InputAdornment position="end">px</InputAdornment> }}
            />
            <TextField
              label="Y"
              type="number"
              value={currentShadow.offsetY}
              onChange={(e) => onUpdate({ ...currentShadow, offsetY: parseInt(e.target.value) || 0 })}
              size="small"
              sx={{ flex: 1 }}
              InputProps={{ endAdornment: <InputAdornment position="end">px</InputAdornment> }}
            />
          </Box>
          
          <TextField
            label="Blur"
            type="number"
            value={currentShadow.blur}
            onChange={(e) => onUpdate({ ...currentShadow, blur: Math.max(0, parseInt(e.target.value) || 0) })}
            size="small"
            fullWidth
            sx={{ mb: 1 }}
            InputProps={{ endAdornment: <InputAdornment position="end">px</InputAdornment> }}
          />
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
        <Typography variant="body2" sx={{ minWidth: 60 }}>
          Fill
        </Typography>
        <ColorPicker
          color={props.fillColor}
          onColorChange={(color) => onUpdate({ fillColor: color || "#cccccc" })}
          showCustom={true}
        />
      </Box>

      <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1 }}>
        <Typography variant="body2" sx={{ minWidth: 60 }}>
          Border
        </Typography>
        <ColorPicker
          color={props.borderColor}
          onColorChange={(color) => onUpdate({ borderColor: color || "#000000" })}
          showCustom={true}
        />
      </Box>

      <NumberField
        label="Border Width"
        value={props.borderWidth}
        onChange={(val) => onUpdate({ borderWidth: val })}
        min={0}
        max={50}
        adornment="px"
      />

      <NumberField
        label="Border Radius"
        value={props.borderRadius}
        onChange={(val) => onUpdate({ borderRadius: val })}
        min={0}
        max={100}
        adornment="px"
      />

      <Typography variant="body2" gutterBottom>
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
        <Typography variant="body2" sx={{ minWidth: 60 }}>
          Fill
        </Typography>
        <ColorPicker
          color={props.fillColor}
          onColorChange={(color) => onUpdate({ fillColor: color || "#cccccc" })}
          showCustom={true}
        />
      </Box>

      <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1 }}>
        <Typography variant="body2" sx={{ minWidth: 60 }}>
          Border
        </Typography>
        <ColorPicker
          color={props.borderColor}
          onColorChange={(color) => onUpdate({ borderColor: color || "#000000" })}
          showCustom={true}
        />
      </Box>

      <NumberField
        label="Border Width"
        value={props.borderWidth}
        onChange={(val) => onUpdate({ borderWidth: val })}
        min={0}
        max={50}
        adornment="px"
      />

      <Typography variant="body2" gutterBottom>
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
        <Typography variant="body2" sx={{ minWidth: 60 }}>
          Stroke
        </Typography>
        <ColorPicker
          color={props.strokeColor}
          onColorChange={(color) => onUpdate({ strokeColor: color || "#000000" })}
          showCustom={true}
        />
      </Box>

      <NumberField
        label="Stroke Width"
        value={props.strokeWidth}
        onChange={(val) => onUpdate({ strokeWidth: val })}
        min={1}
        max={50}
        adornment="px"
      />

      <Typography variant="body2" gutterBottom>
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
      
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={props.startArrow}
            onChange={(e) => onUpdate({ startArrow: e.target.checked })}
          />
        }
        label="Start Arrow"
        sx={{ mb: 1 }}
      />
      
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={props.endArrow}
            onChange={(e) => onUpdate({ endArrow: e.target.checked })}
          />
        }
        label="End Arrow"
      />
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
  onRemoveExposedInput
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
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          borderLeft: `1px solid ${theme.vars.palette.divider}`
        }}
      >
        <Box
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
          sx={{
            p: 2,
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
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        borderLeft: `1px solid ${theme.vars.palette.divider}`
      }}
    >
      <Box
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
        sx={{
          flexGrow: 1,
          overflow: "auto",
          p: 1.5
        }}
      >
        {/* Element name */}
        <TextField
          label="Name"
          value={element.name}
          onChange={(e) => handleUpdateElement({ name: e.target.value })}
          size="small"
          fullWidth
          sx={{ mb: 1 }}
        />

        <Divider sx={{ my: 1.5 }} />

        {/* Transform properties */}
        <SectionHeader title="Transform" />
        <Box sx={{ display: "flex", gap: 1 }}>
          <NumberField
            label="X"
            value={Math.round(element.x)}
            onChange={(val) => handleUpdateElement({ x: val })}
            adornment="px"
          />
          <NumberField
            label="Y"
            value={Math.round(element.y)}
            onChange={(val) => handleUpdateElement({ y: val })}
            adornment="px"
          />
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <NumberField
            label="Width"
            value={Math.round(element.width)}
            onChange={(val) => handleUpdateElement({ width: val })}
            min={10}
            adornment="px"
          />
          <NumberField
            label="Height"
            value={Math.round(element.height)}
            onChange={(val) => handleUpdateElement({ height: val })}
            min={10}
            adornment="px"
          />
        </Box>
        <NumberField
          label="Rotation"
          value={Math.round(element.rotation)}
          onChange={(val) => handleUpdateElement({ rotation: val })}
          min={-360}
          max={360}
          adornment="°"
        />

        <Divider sx={{ my: 1.5 }} />

        {/* Type-specific properties */}
        <SectionHeader title={`${element.type} Properties`} />
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
