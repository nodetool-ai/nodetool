/**
 * PropertyEditor Component
 *
 * Professional editor panel for modifying element properties, styles, and bindings.
 * Features collapsible sections with visual controls similar to modern design tools.
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  Box,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
  InputAdornment,
  SelectChangeEvent
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LinkIcon from "@mui/icons-material/Link";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import CropFreeIcon from "@mui/icons-material/CropFree";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import VerticalAlignTopIcon from "@mui/icons-material/VerticalAlignTop";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
import FormatAlignCenterIcon from "@mui/icons-material/FormatAlignCenter";
import FormatAlignRightIcon from "@mui/icons-material/FormatAlignRight";
import FormatAlignJustifyIcon from "@mui/icons-material/FormatAlignJustify";
import { useHTMLBuilderStore } from "../../../../stores/useHTMLBuilderStore";
import type { BuilderElement } from "../types/builder.types";
import type { CSSProperties } from "react";

/**
 * Props for PropertyEditor
 */
interface PropertyEditorProps {
  /** The element to edit (null if none selected) */
  element: BuilderElement | null;
  /** Called when binding dialog should open */
  onOpenBindingDialog?: (elementId: string, target: string) => void;
}

/**
 * Styled input for compact number/text values
 */
interface CompactInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  unit?: string;
  placeholder?: string;
  type?: "text" | "number";
}

const CompactInput: React.FC<CompactInputProps> = ({
  value,
  onChange,
  label,
  unit,
  placeholder = "Auto"
}) => {
  const theme = useTheme();

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      {label && (
        <Typography
          variant="caption"
          sx={{
            color: theme.vars.palette.text.secondary,
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.5px"
          }}
        >
          {label}
        </Typography>
      )}
      <TextField
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        size="small"
        slotProps={{
          input: {
            endAdornment: unit ? (
              <InputAdornment position="end">
                <Typography
                  variant="caption"
                  sx={{ color: theme.vars.palette.text.secondary, fontSize: "10px" }}
                >
                  {unit}
                </Typography>
              </InputAdornment>
            ) : undefined,
            sx: {
              fontSize: "12px",
              height: "32px",
              backgroundColor: theme.vars.palette.background.default,
              "& input": {
                padding: "6px 8px"
              }
            }
          }
        }}
        sx={{ width: "100%" }}
      />
    </Box>
  );
};

/**
 * Spacing box visual editor (margin/padding)
 */
interface SpacingBoxProps {
  marginTop: string;
  marginRight: string;
  marginBottom: string;
  marginLeft: string;
  paddingTop: string;
  paddingRight: string;
  paddingBottom: string;
  paddingLeft: string;
  onMarginChange: (side: string, value: string) => void;
  onPaddingChange: (side: string, value: string) => void;
}

const SpacingBox: React.FC<SpacingBoxProps> = ({
  marginTop,
  marginRight,
  marginBottom,
  marginLeft,
  paddingTop,
  paddingRight,
  paddingBottom,
  paddingLeft,
  onMarginChange,
  onPaddingChange
}) => {
  const theme = useTheme();

  const inputStyle = {
    width: "40px",
    "& input": {
      textAlign: "center" as const,
      padding: "4px",
      fontSize: "11px"
    },
    "& .MuiOutlinedInput-root": {
      height: "24px",
      backgroundColor: "transparent"
    }
  };

  return (
    <Box
      sx={{
        position: "relative",
        backgroundColor: theme.vars.palette.background.default,
        borderRadius: 1,
        p: 1
      }}
    >
      {/* Margin label */}
      <Typography
        variant="caption"
        sx={{
          position: "absolute",
          top: 4,
          left: 8,
          fontSize: "9px",
          color: theme.vars.palette.text.secondary,
          textTransform: "uppercase"
        }}
      >
        Margin
      </Typography>

      {/* Outer box (margin) */}
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          pt: 2
        }}
      >
        {/* Top margin */}
        <TextField
          value={marginTop}
          onChange={(e) => onMarginChange("Top", e.target.value)}
          size="small"
          placeholder="0"
          sx={inputStyle}
        />

        {/* Middle row */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            my: 1
          }}
        >
          {/* Left margin */}
          <TextField
            value={marginLeft}
            onChange={(e) => onMarginChange("Left", e.target.value)}
            size="small"
            placeholder="0"
            sx={inputStyle}
          />

          {/* Inner box (padding) */}
          <Box
            sx={{
              backgroundColor: theme.vars.palette.background.paper,
              border: `1px solid ${theme.vars.palette.divider}`,
              borderRadius: 1,
              p: 1,
              position: "relative"
            }}
          >
            {/* Padding label */}
            <Typography
              variant="caption"
              sx={{
                position: "absolute",
                top: 2,
                left: 6,
                fontSize: "9px",
                color: theme.vars.palette.text.secondary,
                textTransform: "uppercase"
              }}
            >
              Padding
            </Typography>

            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                pt: 1.5
              }}
            >
              {/* Top padding */}
              <TextField
                value={paddingTop}
                onChange={(e) => onPaddingChange("Top", e.target.value)}
                size="small"
                placeholder="0"
                sx={inputStyle}
              />

              {/* Middle padding row */}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  my: 0.5
                }}
              >
                <TextField
                  value={paddingLeft}
                  onChange={(e) => onPaddingChange("Left", e.target.value)}
                  size="small"
                  placeholder="0"
                  sx={inputStyle}
                />
                <Box
                  sx={{
                    width: 60,
                    height: 30,
                    backgroundColor: theme.vars.palette.action.hover,
                    borderRadius: 0.5
                  }}
                />
                <TextField
                  value={paddingRight}
                  onChange={(e) => onPaddingChange("Right", e.target.value)}
                  size="small"
                  placeholder="0"
                  sx={inputStyle}
                />
              </Box>

              {/* Bottom padding */}
              <TextField
                value={paddingBottom}
                onChange={(e) => onPaddingChange("Bottom", e.target.value)}
                size="small"
                placeholder="0"
                sx={inputStyle}
              />
            </Box>
          </Box>

          {/* Right margin */}
          <TextField
            value={marginRight}
            onChange={(e) => onMarginChange("Right", e.target.value)}
            size="small"
            placeholder="0"
            sx={inputStyle}
          />
        </Box>

        {/* Bottom margin */}
        <TextField
          value={marginBottom}
          onChange={(e) => onMarginChange("Bottom", e.target.value)}
          size="small"
          placeholder="0"
          sx={inputStyle}
        />
      </Box>
    </Box>
  );
};

/**
 * Section header with expand/collapse
 */
interface SectionProps {
  title: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({
  title,
  defaultExpanded = false,
  children
}) => {
  const theme = useTheme();

  return (
    <Accordion
      defaultExpanded={defaultExpanded}
      disableGutters
      elevation={0}
      sx={{
        backgroundColor: "transparent",
        "&:before": { display: "none" },
        "& .MuiAccordionSummary-root": {
          minHeight: 36,
          padding: "0 8px",
          "&.Mui-expanded": {
            minHeight: 36
          }
        },
        "& .MuiAccordionSummary-content": {
          margin: "8px 0",
          "&.Mui-expanded": {
            margin: "8px 0"
          }
        }
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon sx={{ fontSize: 18 }} />}
        sx={{
          borderBottom: `1px solid ${theme.vars.palette.divider}`
        }}
      >
        <Typography variant="subtitle2" fontWeight={600} fontSize="13px">
          {title}
        </Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ p: 1.5 }}>{children}</AccordionDetails>
    </Accordion>
  );
};

/**
 * PropertyEditor component
 */
export const PropertyEditor: React.FC<PropertyEditorProps> = ({
  element,
  onOpenBindingDialog
}) => {
  const theme = useTheme();
  const [expandedSections] = useState<Record<string, boolean>>({
    layout: true,
    spacing: true,
    size: false,
    position: false,
    typography: false,
    appearance: false,
    bindings: false
  });

  // Store actions
  const updateElementStyles = useHTMLBuilderStore(
    (state) => state.updateElementStyles
  );
  const updateElementAttributes = useHTMLBuilderStore(
    (state) => state.updateElementAttributes
  );
  const unbindProperty = useHTMLBuilderStore((state) => state.unbindProperty);

  // Handle style change
  const handleStyleChange = useCallback(
    (styleName: string, value: string) => {
      if (element) {
        updateElementStyles(element.id, { [styleName]: value } as CSSProperties);
      }
    },
    [element, updateElementStyles]
  );

  // Handle attribute change
  const handleAttributeChange = useCallback(
    (attrName: string, value: string) => {
      if (element) {
        updateElementAttributes(element.id, { [attrName]: value });
      }
    },
    [element, updateElementAttributes]
  );

  // Handle unbind
  const handleUnbind = useCallback(
    (bindingKey: string) => {
      if (element) {
        unbindProperty(element.id, bindingKey);
      }
    },
    [element, unbindProperty]
  );

  // Handle display change
  const handleDisplayChange = useCallback(
    (_event: React.MouseEvent<HTMLElement>, newValue: string | null) => {
      if (newValue && element) {
        handleStyleChange("display", newValue);
      }
    },
    [element, handleStyleChange]
  );

  // Handle text align change
  const handleTextAlignChange = useCallback(
    (_event: React.MouseEvent<HTMLElement>, newValue: string | null) => {
      if (newValue && element) {
        handleStyleChange("textAlign", newValue);
      }
    },
    [element, handleStyleChange]
  );

  // Handle overflow change
  const handleOverflowChange = useCallback(
    (_event: React.MouseEvent<HTMLElement>, newValue: string | null) => {
      if (newValue && element) {
        handleStyleChange("overflow", newValue);
      }
    },
    [element, handleStyleChange]
  );

  // Handle position change
  const handlePositionChange = useCallback(
    (event: SelectChangeEvent<string>) => {
      if (element) {
        handleStyleChange("position", event.target.value);
      }
    },
    [element, handleStyleChange]
  );

  // Parse spacing value from combined shorthand
  const parseSpacing = useMemo(() => {
    if (!element) {
      return {
        marginTop: "",
        marginRight: "",
        marginBottom: "",
        marginLeft: "",
        paddingTop: "",
        paddingRight: "",
        paddingBottom: "",
        paddingLeft: ""
      };
    }

    return {
      marginTop: String(element.styles.marginTop || ""),
      marginRight: String(element.styles.marginRight || ""),
      marginBottom: String(element.styles.marginBottom || ""),
      marginLeft: String(element.styles.marginLeft || ""),
      paddingTop: String(element.styles.paddingTop || ""),
      paddingRight: String(element.styles.paddingRight || ""),
      paddingBottom: String(element.styles.paddingBottom || ""),
      paddingLeft: String(element.styles.paddingLeft || "")
    };
  }, [element]);

  if (!element) {
    return (
      <Box
        sx={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 3,
          textAlign: "center"
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Select an element to edit its properties
        </Typography>
      </Box>
    );
  }

  const currentDisplay = String(element.styles.display || "block");
  const currentTextAlign = String(element.styles.textAlign || "left");
  const currentOverflow = String(element.styles.overflow || "visible");
  const currentPosition = String(element.styles.position || "static");

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "auto",
        backgroundColor: theme.vars.palette.background.paper
      }}
    >
      {/* Layout Section */}
      <Section title="Layout" defaultExpanded={expandedSections.layout}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {/* Display Toggle */}
          <Box>
            <Typography
              variant="caption"
              sx={{
                color: theme.vars.palette.text.secondary,
                fontSize: "10px",
                textTransform: "uppercase",
                mb: 0.5,
                display: "block"
              }}
            >
              Display
            </Typography>
            <ToggleButtonGroup
              value={currentDisplay}
              exclusive
              onChange={handleDisplayChange}
              size="small"
              fullWidth
              sx={{
                "& .MuiToggleButton-root": {
                  flex: 1,
                  fontSize: "11px",
                  py: 0.5,
                  textTransform: "capitalize"
                }
              }}
            >
              <ToggleButton value="block">Block</ToggleButton>
              <ToggleButton value="flex">Flex</ToggleButton>
              <ToggleButton value="grid">Grid</ToggleButton>
              <ToggleButton value="none">None</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Flex direction (show when display is flex) */}
          {currentDisplay === "flex" && (
            <Box sx={{ display: "flex", gap: 1 }}>
              <FormControl size="small" fullWidth>
                <InputLabel sx={{ fontSize: "12px" }}>Direction</InputLabel>
                <Select
                  value={String(element.styles.flexDirection || "row")}
                  label="Direction"
                  onChange={(e) => handleStyleChange("flexDirection", e.target.value)}
                  sx={{ fontSize: "12px" }}
                >
                  <MenuItem value="row">Row</MenuItem>
                  <MenuItem value="column">Column</MenuItem>
                  <MenuItem value="row-reverse">Row Reverse</MenuItem>
                  <MenuItem value="column-reverse">Column Reverse</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel sx={{ fontSize: "12px" }}>Wrap</InputLabel>
                <Select
                  value={String(element.styles.flexWrap || "nowrap")}
                  label="Wrap"
                  onChange={(e) => handleStyleChange("flexWrap", e.target.value)}
                  sx={{ fontSize: "12px" }}
                >
                  <MenuItem value="nowrap">No Wrap</MenuItem>
                  <MenuItem value="wrap">Wrap</MenuItem>
                  <MenuItem value="wrap-reverse">Wrap Reverse</MenuItem>
                </Select>
              </FormControl>
            </Box>
          )}

          {/* Justify and Align (show when display is flex or grid) */}
          {(currentDisplay === "flex" || currentDisplay === "grid") && (
            <Box sx={{ display: "flex", gap: 1 }}>
              <FormControl size="small" fullWidth>
                <InputLabel sx={{ fontSize: "12px" }}>Justify</InputLabel>
                <Select
                  value={String(element.styles.justifyContent || "flex-start")}
                  label="Justify"
                  onChange={(e) => handleStyleChange("justifyContent", e.target.value)}
                  sx={{ fontSize: "12px" }}
                >
                  <MenuItem value="flex-start">Start</MenuItem>
                  <MenuItem value="center">Center</MenuItem>
                  <MenuItem value="flex-end">End</MenuItem>
                  <MenuItem value="space-between">Space Between</MenuItem>
                  <MenuItem value="space-around">Space Around</MenuItem>
                  <MenuItem value="space-evenly">Space Evenly</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel sx={{ fontSize: "12px" }}>Align</InputLabel>
                <Select
                  value={String(element.styles.alignItems || "stretch")}
                  label="Align"
                  onChange={(e) => handleStyleChange("alignItems", e.target.value)}
                  sx={{ fontSize: "12px" }}
                >
                  <MenuItem value="flex-start">Start</MenuItem>
                  <MenuItem value="center">Center</MenuItem>
                  <MenuItem value="flex-end">End</MenuItem>
                  <MenuItem value="stretch">Stretch</MenuItem>
                  <MenuItem value="baseline">Baseline</MenuItem>
                </Select>
              </FormControl>
            </Box>
          )}

          {/* Gap */}
          <CompactInput
            label="Gap"
            value={String(element.styles.gap || "")}
            onChange={(v) => handleStyleChange("gap", v)}
            placeholder="0"
          />
        </Box>
      </Section>

      {/* Spacing Section */}
      <Section title="Spacing" defaultExpanded={expandedSections.spacing}>
        <SpacingBox
          marginTop={parseSpacing.marginTop}
          marginRight={parseSpacing.marginRight}
          marginBottom={parseSpacing.marginBottom}
          marginLeft={parseSpacing.marginLeft}
          paddingTop={parseSpacing.paddingTop}
          paddingRight={parseSpacing.paddingRight}
          paddingBottom={parseSpacing.paddingBottom}
          paddingLeft={parseSpacing.paddingLeft}
          onMarginChange={(side, value) => handleStyleChange(`margin${side}`, value)}
          onPaddingChange={(side, value) => handleStyleChange(`padding${side}`, value)}
        />
      </Section>

      {/* Size Section */}
      <Section title="Size" defaultExpanded={expandedSections.size}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {/* Width/Height */}
          <Box sx={{ display: "flex", gap: 1 }}>
            <CompactInput
              label="Width"
              value={String(element.styles.width || "")}
              onChange={(v) => handleStyleChange("width", v)}
            />
            <CompactInput
              label="Height"
              value={String(element.styles.height || "")}
              onChange={(v) => handleStyleChange("height", v)}
            />
          </Box>

          {/* Min Width/Height */}
          <Box sx={{ display: "flex", gap: 1 }}>
            <CompactInput
              label="Min W"
              value={String(element.styles.minWidth || "")}
              onChange={(v) => handleStyleChange("minWidth", v)}
              unit="PX"
            />
            <CompactInput
              label="Min H"
              value={String(element.styles.minHeight || "")}
              onChange={(v) => handleStyleChange("minHeight", v)}
              unit="PX"
            />
          </Box>

          {/* Max Width/Height */}
          <Box sx={{ display: "flex", gap: 1 }}>
            <CompactInput
              label="Max W"
              value={String(element.styles.maxWidth || "")}
              onChange={(v) => handleStyleChange("maxWidth", v)}
            />
            <CompactInput
              label="Max H"
              value={String(element.styles.maxHeight || "")}
              onChange={(v) => handleStyleChange("maxHeight", v)}
            />
          </Box>

          {/* Overflow */}
          <Box>
            <Typography
              variant="caption"
              sx={{
                color: theme.vars.palette.text.secondary,
                fontSize: "10px",
                textTransform: "uppercase",
                mb: 0.5,
                display: "block"
              }}
            >
              Overflow
            </Typography>
            <ToggleButtonGroup
              value={currentOverflow}
              exclusive
              onChange={handleOverflowChange}
              size="small"
              sx={{
                "& .MuiToggleButton-root": {
                  px: 1.5,
                  py: 0.5
                }
              }}
            >
              <ToggleButton value="visible">
                <Tooltip title="Visible">
                  <VisibilityIcon sx={{ fontSize: 16 }} />
                </Tooltip>
              </ToggleButton>
              <ToggleButton value="hidden">
                <Tooltip title="Hidden">
                  <VisibilityOffIcon sx={{ fontSize: 16 }} />
                </Tooltip>
              </ToggleButton>
              <ToggleButton value="scroll">
                <Tooltip title="Scroll">
                  <CropFreeIcon sx={{ fontSize: 16 }} />
                </Tooltip>
              </ToggleButton>
              <ToggleButton value="auto">
                <Tooltip title="Auto">
                  <OpenInFullIcon sx={{ fontSize: 16 }} />
                </Tooltip>
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Box>
      </Section>

      {/* Position Section */}
      <Section title="Position" defaultExpanded={expandedSections.position}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <FormControl size="small" fullWidth>
            <InputLabel sx={{ fontSize: "12px" }}>Position</InputLabel>
            <Select
              value={currentPosition}
              label="Position"
              onChange={handlePositionChange}
              sx={{ fontSize: "12px" }}
              startAdornment={
                <VerticalAlignTopIcon sx={{ fontSize: 16, mr: 1, color: theme.vars.palette.text.secondary }} />
              }
            >
              <MenuItem value="static">Static</MenuItem>
              <MenuItem value="relative">Relative</MenuItem>
              <MenuItem value="absolute">Absolute</MenuItem>
              <MenuItem value="fixed">Fixed</MenuItem>
              <MenuItem value="sticky">Sticky</MenuItem>
            </Select>
          </FormControl>

          {/* Position offsets (show when not static) */}
          {currentPosition !== "static" && (
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
              <CompactInput
                label="Top"
                value={String(element.styles.top || "")}
                onChange={(v) => handleStyleChange("top", v)}
              />
              <CompactInput
                label="Right"
                value={String(element.styles.right || "")}
                onChange={(v) => handleStyleChange("right", v)}
              />
              <CompactInput
                label="Bottom"
                value={String(element.styles.bottom || "")}
                onChange={(v) => handleStyleChange("bottom", v)}
              />
              <CompactInput
                label="Left"
                value={String(element.styles.left || "")}
                onChange={(v) => handleStyleChange("left", v)}
              />
            </Box>
          )}

          {/* Z-index */}
          <CompactInput
            label="Z-Index"
            value={String(element.styles.zIndex || "")}
            onChange={(v) => handleStyleChange("zIndex", v)}
            placeholder="auto"
          />
        </Box>
      </Section>

      {/* Typography Section */}
      <Section title="Typography" defaultExpanded={expandedSections.typography}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {/* Font Family */}
          <FormControl size="small" fullWidth>
            <InputLabel sx={{ fontSize: "12px" }}>Font</InputLabel>
            <Select
              value={String(element.styles.fontFamily || "inherit")}
              label="Font"
              onChange={(e) => handleStyleChange("fontFamily", e.target.value)}
              sx={{ fontSize: "12px" }}
            >
              <MenuItem value="inherit">Inherit</MenuItem>
              <MenuItem value="Arial, sans-serif">Arial</MenuItem>
              <MenuItem value="'Helvetica Neue', sans-serif">Helvetica</MenuItem>
              <MenuItem value="'Times New Roman', serif">Times New Roman</MenuItem>
              <MenuItem value="Georgia, serif">Georgia</MenuItem>
              <MenuItem value="'Courier New', monospace">Courier New</MenuItem>
              <MenuItem value="Roboto, sans-serif">Roboto</MenuItem>
              <MenuItem value="'Open Sans', sans-serif">Open Sans</MenuItem>
              <MenuItem value="system-ui, sans-serif">System UI</MenuItem>
            </Select>
          </FormControl>

          {/* Font Weight */}
          <FormControl size="small" fullWidth>
            <InputLabel sx={{ fontSize: "12px" }}>Weight</InputLabel>
            <Select
              value={String(element.styles.fontWeight || "400")}
              label="Weight"
              onChange={(e) => handleStyleChange("fontWeight", e.target.value)}
              sx={{ fontSize: "12px" }}
            >
              <MenuItem value="100">100 - Thin</MenuItem>
              <MenuItem value="200">200 - Extra Light</MenuItem>
              <MenuItem value="300">300 - Light</MenuItem>
              <MenuItem value="400">400 - Normal</MenuItem>
              <MenuItem value="500">500 - Medium</MenuItem>
              <MenuItem value="600">600 - Semi Bold</MenuItem>
              <MenuItem value="700">700 - Bold</MenuItem>
              <MenuItem value="800">800 - Extra Bold</MenuItem>
              <MenuItem value="900">900 - Black</MenuItem>
            </Select>
          </FormControl>

          {/* Font Size and Line Height */}
          <Box sx={{ display: "flex", gap: 1 }}>
            <CompactInput
              label="Size"
              value={String(element.styles.fontSize || "")}
              onChange={(v) => handleStyleChange("fontSize", v)}
              placeholder="16px"
            />
            <CompactInput
              label="Line Height"
              value={String(element.styles.lineHeight || "")}
              onChange={(v) => handleStyleChange("lineHeight", v)}
              placeholder="1.5"
            />
          </Box>

          {/* Letter Spacing */}
          <CompactInput
            label="Letter Spacing"
            value={String(element.styles.letterSpacing || "")}
            onChange={(v) => handleStyleChange("letterSpacing", v)}
            placeholder="normal"
          />

          {/* Text Align */}
          <Box>
            <Typography
              variant="caption"
              sx={{
                color: theme.vars.palette.text.secondary,
                fontSize: "10px",
                textTransform: "uppercase",
                mb: 0.5,
                display: "block"
              }}
            >
              Text Align
            </Typography>
            <ToggleButtonGroup
              value={currentTextAlign}
              exclusive
              onChange={handleTextAlignChange}
              size="small"
              sx={{
                "& .MuiToggleButton-root": {
                  px: 1.5,
                  py: 0.5
                }
              }}
            >
              <ToggleButton value="left">
                <FormatAlignLeftIcon sx={{ fontSize: 16 }} />
              </ToggleButton>
              <ToggleButton value="center">
                <FormatAlignCenterIcon sx={{ fontSize: 16 }} />
              </ToggleButton>
              <ToggleButton value="right">
                <FormatAlignRightIcon sx={{ fontSize: 16 }} />
              </ToggleButton>
              <ToggleButton value="justify">
                <FormatAlignJustifyIcon sx={{ fontSize: 16 }} />
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Text Color */}
          <Box sx={{ display: "flex", gap: 1, alignItems: "flex-end" }}>
            <Box sx={{ flex: 1 }}>
              <Typography
                variant="caption"
                sx={{
                  color: theme.vars.palette.text.secondary,
                  fontSize: "10px",
                  textTransform: "uppercase",
                  mb: 0.5,
                  display: "block"
                }}
              >
                Color
              </Typography>
              <TextField
                type="color"
                value={String(element.styles.color || "#000000")}
                onChange={(e) => handleStyleChange("color", e.target.value)}
                size="small"
                sx={{
                  width: 50,
                  "& input": { padding: "4px", height: "24px", cursor: "pointer" }
                }}
              />
            </Box>
            <TextField
              value={String(element.styles.color || "")}
              onChange={(e) => handleStyleChange("color", e.target.value)}
              placeholder="#000000"
              size="small"
              sx={{
                flex: 2,
                "& input": { fontSize: "12px" }
              }}
            />
          </Box>
        </Box>
      </Section>

      {/* Appearance Section */}
      <Section title="Appearance" defaultExpanded={expandedSections.appearance}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {/* Background Color */}
          <Box sx={{ display: "flex", gap: 1, alignItems: "flex-end" }}>
            <Box>
              <Typography
                variant="caption"
                sx={{
                  color: theme.vars.palette.text.secondary,
                  fontSize: "10px",
                  textTransform: "uppercase",
                  mb: 0.5,
                  display: "block"
                }}
              >
                Background
              </Typography>
              <TextField
                type="color"
                value={String(element.styles.backgroundColor || "#ffffff")}
                onChange={(e) => handleStyleChange("backgroundColor", e.target.value)}
                size="small"
                sx={{
                  width: 50,
                  "& input": { padding: "4px", height: "24px", cursor: "pointer" }
                }}
              />
            </Box>
            <TextField
              value={String(element.styles.backgroundColor || "")}
              onChange={(e) => handleStyleChange("backgroundColor", e.target.value)}
              placeholder="transparent"
              size="small"
              sx={{
                flex: 1,
                "& input": { fontSize: "12px" }
              }}
            />
          </Box>

          {/* Border Radius */}
          <CompactInput
            label="Border Radius"
            value={String(element.styles.borderRadius || "")}
            onChange={(v) => handleStyleChange("borderRadius", v)}
            placeholder="0"
          />

          {/* Border */}
          <CompactInput
            label="Border"
            value={String(element.styles.border || "")}
            onChange={(v) => handleStyleChange("border", v)}
            placeholder="none"
          />

          {/* Box Shadow */}
          <CompactInput
            label="Box Shadow"
            value={String(element.styles.boxShadow || "")}
            onChange={(v) => handleStyleChange("boxShadow", v)}
            placeholder="none"
          />

          {/* Opacity */}
          <CompactInput
            label="Opacity"
            value={String(element.styles.opacity || "")}
            onChange={(v) => handleStyleChange("opacity", v)}
            placeholder="1"
          />
        </Box>
      </Section>

      {/* Attributes Section */}
      <Section title="Attributes" defaultExpanded={false}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <CompactInput
            label="ID"
            value={element.attributes.id || ""}
            onChange={(v) => handleAttributeChange("id", v)}
            placeholder="element-id"
          />
          <CompactInput
            label="Class"
            value={element.attributes.class || ""}
            onChange={(v) => handleAttributeChange("class", v)}
            placeholder="class-name"
          />
          <CompactInput
            label="Title"
            value={element.attributes.title || ""}
            onChange={(v) => handleAttributeChange("title", v)}
            placeholder="Element title"
          />

          {/* Tag-specific attributes */}
          {element.tag === "a" && (
            <>
              <CompactInput
                label="Href"
                value={element.attributes.href || ""}
                onChange={(v) => handleAttributeChange("href", v)}
                placeholder="https://..."
              />
              <CompactInput
                label="Target"
                value={element.attributes.target || ""}
                onChange={(v) => handleAttributeChange("target", v)}
                placeholder="_blank"
              />
            </>
          )}
          {element.tag === "img" && (
            <>
              <CompactInput
                label="Src"
                value={element.attributes.src || ""}
                onChange={(v) => handleAttributeChange("src", v)}
                placeholder="image-url"
              />
              <CompactInput
                label="Alt"
                value={element.attributes.alt || ""}
                onChange={(v) => handleAttributeChange("alt", v)}
                placeholder="Image description"
              />
            </>
          )}
        </Box>
      </Section>

      {/* Bindings Section */}
      <Section title="Property Bindings" defaultExpanded={expandedSections.bindings}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {/* Existing bindings */}
          {Object.entries(element.propertyBindings).length > 0 && (
            <Box>
              {Object.entries(element.propertyBindings).map(([key, binding]) => (
                <Box
                  key={key}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    p: 1,
                    mb: 1,
                    borderRadius: 1,
                    backgroundColor: theme.vars.palette.action.hover
                  }}
                >
                  <LinkIcon fontSize="small" color="primary" />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" fontSize="12px">
                      {binding.propertyName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" fontSize="10px">
                      → {binding.bindingType === "content" ? "content" : binding.attributeName || binding.styleProperty}
                    </Typography>
                  </Box>
                  <Chip label={binding.propertyType} size="small" variant="outlined" sx={{ fontSize: "10px" }} />
                  <Tooltip title="Remove binding">
                    <IconButton size="small" onClick={() => handleUnbind(key)}>
                      <LinkOffIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              ))}
            </Box>
          )}

          {/* Add binding button */}
          <Button
            variant="outlined"
            startIcon={<LinkIcon />}
            onClick={() => onOpenBindingDialog?.(element.id, "content")}
            size="small"
            sx={{ fontSize: "12px" }}
          >
            Add Property Binding
          </Button>

          {/* Template syntax help */}
          <Box
            sx={{
              p: 1,
              backgroundColor: theme.vars.palette.action.hover,
              borderRadius: 1
            }}
          >
            <Typography variant="caption" color="text.secondary" fontSize="10px">
              Use {"{{property_name}}"} in text content or attributes for dynamic values
            </Typography>
          </Box>
        </Box>
      </Section>
    </Box>
  );
};

export default PropertyEditor;
