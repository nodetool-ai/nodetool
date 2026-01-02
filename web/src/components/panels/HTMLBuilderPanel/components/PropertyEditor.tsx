/**
 * PropertyEditor Component
 *
 * Professional editor panel for modifying element properties, styles, and bindings.
 * Features collapsible sections with visual controls similar to modern design tools.
 * Design follows NodeTool's settings panel styling patterns.
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  Box,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  Button,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
  Chip,
  ToggleButton,
  ToggleButtonGroup
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LinkIcon from "@mui/icons-material/Link";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import CropFreeIcon from "@mui/icons-material/CropFree";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
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
 * Styled input component matching NodeTool's design
 */
interface PropertyInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  type?: "text" | "number" | "color";
  fullWidth?: boolean;
}

const PropertyInput: React.FC<PropertyInputProps> = ({
  value,
  onChange,
  label,
  placeholder = "",
  type = "text",
  fullWidth = true
}) => {
  const theme = useTheme();

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, flex: fullWidth ? 1 : "none" }}>
      {label && (
        <Typography
          sx={{
            color: theme.vars.palette.c_gray1,
            fontSize: "0.75rem",
            fontWeight: 500,
            marginBottom: "4px"
          }}
        >
          {label}
        </Typography>
      )}
      <TextField
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        size="small"
        fullWidth={fullWidth}
        sx={{
          "& .MuiOutlinedInput-root": {
            fontSize: "0.8125rem",
            backgroundColor: theme.vars.palette.background.paper,
            borderRadius: "4px",
            "& fieldset": {
              borderColor: theme.vars.palette.divider
            },
            "&:hover fieldset": {
              borderColor: theme.vars.palette.c_gray2
            },
            "&.Mui-focused fieldset": {
              borderColor: theme.vars.palette.primary.main,
              borderWidth: 1
            }
          },
          "& input": {
            padding: "8px 12px"
          }
        }}
      />
    </Box>
  );
};

/**
 * Labeled dropdown select component
 */
interface PropertySelectProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: { value: string; label: string }[];
  fullWidth?: boolean;
}

const PropertySelect: React.FC<PropertySelectProps> = ({
  value,
  onChange,
  label,
  options,
  fullWidth = true
}) => {
  const theme = useTheme();

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, flex: fullWidth ? 1 : "none" }}>
      <Typography
        sx={{
          color: theme.vars.palette.c_gray1,
          fontSize: "0.75rem",
          fontWeight: 500,
          marginBottom: "4px"
        }}
      >
        {label}
      </Typography>
      <FormControl fullWidth={fullWidth} size="small">
        <Select
          value={value}
          onChange={(e) => onChange(e.target.value as string)}
          sx={{
            fontSize: "0.8125rem",
            backgroundColor: theme.vars.palette.background.paper,
            borderRadius: "4px",
            "& .MuiOutlinedInput-notchedOutline": {
              borderColor: theme.vars.palette.divider
            },
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: theme.vars.palette.c_gray2
            },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              borderColor: theme.vars.palette.primary.main,
              borderWidth: 1
            }
          }}
        >
          {options.map((opt) => (
            <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: "0.8125rem" }}>
              {opt.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>
  );
};

/**
 * Spacing box visual editor (margin/padding) - improved design
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
    width: "36px",
    "& input": {
      textAlign: "center" as const,
      padding: "4px",
      fontSize: "0.75rem"
    },
    "& .MuiOutlinedInput-root": {
      height: "26px",
      backgroundColor: "transparent",
      "& fieldset": {
        borderColor: theme.vars.palette.divider
      },
      "&:hover fieldset": {
        borderColor: theme.vars.palette.c_gray2
      },
      "&.Mui-focused fieldset": {
        borderColor: theme.vars.palette.primary.main,
        borderWidth: 1
      }
    }
  };

  return (
    <Box
      sx={{
        position: "relative",
        backgroundColor: theme.vars.palette.background.default,
        borderRadius: "6px",
        padding: "12px",
        border: `1px solid ${theme.vars.palette.divider}`
      }}
    >
      {/* Margin label */}
      <Typography
        sx={{
          position: "absolute",
          top: 6,
          left: 10,
          fontSize: "0.625rem",
          color: theme.vars.palette.c_gray1,
          textTransform: "uppercase",
          fontWeight: 500,
          letterSpacing: "0.5px"
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
              borderRadius: "4px",
              padding: "10px",
              position: "relative"
            }}
          >
            {/* Padding label */}
            <Typography
              sx={{
                position: "absolute",
                top: 4,
                left: 8,
                fontSize: "0.625rem",
                color: theme.vars.palette.c_gray1,
                textTransform: "uppercase",
                fontWeight: 500,
                letterSpacing: "0.5px"
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
                    width: 50,
                    height: 26,
                    backgroundColor: theme.vars.palette.action.hover,
                    borderRadius: "3px"
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
 * Section component with professional styling
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
        borderBottom: `1px solid ${theme.vars.palette.divider}`,
        "&:last-of-type": {
          borderBottom: "none"
        },
        "& .MuiAccordionSummary-root": {
          minHeight: 40,
          padding: "0 12px",
          "&.Mui-expanded": {
            minHeight: 40
          }
        },
        "& .MuiAccordionSummary-content": {
          margin: "10px 0",
          "&.Mui-expanded": {
            margin: "10px 0"
          }
        }
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon sx={{ fontSize: 18, color: theme.vars.palette.c_gray2 }} />}
      >
        <Typography 
          sx={{ 
            fontWeight: 600, 
            fontSize: "0.8125rem",
            color: theme.vars.palette.c_gray0
          }}
        >
          {title}
        </Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ p: "4px 12px 16px 12px" }}>{children}</AccordionDetails>
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
        <Typography 
          sx={{ 
            color: theme.vars.palette.c_gray2,
            fontSize: "0.8125rem"
          }}
        >
          Select an element to edit its properties
        </Typography>
      </Box>
    );
  }

  const currentDisplay = String(element.styles.display || "block");
  const currentTextAlign = String(element.styles.textAlign || "left");
  const currentOverflow = String(element.styles.overflow || "visible");
  const currentPosition = String(element.styles.position || "static");

  // Common toggle button group styles
  const toggleButtonGroupSx = {
    "& .MuiToggleButton-root": {
      flex: 1,
      fontSize: "0.75rem",
      py: 0.75,
      textTransform: "capitalize",
      border: `1px solid ${theme.vars.palette.divider}`,
      "&.Mui-selected": {
        backgroundColor: theme.vars.palette.primary.main,
        color: theme.vars.palette.primary.contrastText,
        "&:hover": {
          backgroundColor: theme.vars.palette.primary.dark
        }
      }
    }
  };

  // Common label style
  const labelSx = {
    color: theme.vars.palette.c_gray1,
    fontSize: "0.75rem",
    fontWeight: 500,
    marginBottom: "6px",
    display: "block"
  };

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "auto",
        backgroundColor: theme.vars.palette.background.default,
        "&::-webkit-scrollbar": {
          width: "6px"
        },
        "&::-webkit-scrollbar-track": {
          background: "transparent"
        },
        "&::-webkit-scrollbar-thumb": {
          background: theme.vars.palette.c_gray4,
          borderRadius: "3px"
        }
      }}
    >
      {/* Layout Section */}
      <Section title="Layout" defaultExpanded={expandedSections.layout}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Display Toggle */}
          <Box>
            <Typography sx={labelSx}>Display</Typography>
            <ToggleButtonGroup
              value={currentDisplay}
              exclusive
              onChange={handleDisplayChange}
              size="small"
              fullWidth
              sx={toggleButtonGroupSx}
            >
              <ToggleButton value="block">Block</ToggleButton>
              <ToggleButton value="flex">Flex</ToggleButton>
              <ToggleButton value="grid">Grid</ToggleButton>
              <ToggleButton value="none">None</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Flex direction (show when display is flex) */}
          {currentDisplay === "flex" && (
            <Box sx={{ display: "flex", gap: "12px" }}>
              <PropertySelect
                label="Direction"
                value={String(element.styles.flexDirection || "row")}
                onChange={(v) => handleStyleChange("flexDirection", v)}
                options={[
                  { value: "row", label: "Row" },
                  { value: "column", label: "Column" },
                  { value: "row-reverse", label: "Row Reverse" },
                  { value: "column-reverse", label: "Column Reverse" }
                ]}
              />
              <PropertySelect
                label="Wrap"
                value={String(element.styles.flexWrap || "nowrap")}
                onChange={(v) => handleStyleChange("flexWrap", v)}
                options={[
                  { value: "nowrap", label: "No Wrap" },
                  { value: "wrap", label: "Wrap" },
                  { value: "wrap-reverse", label: "Wrap Reverse" }
                ]}
              />
            </Box>
          )}

          {/* Justify and Align (show when display is flex or grid) */}
          {(currentDisplay === "flex" || currentDisplay === "grid") && (
            <Box sx={{ display: "flex", gap: "12px" }}>
              <PropertySelect
                label="Justify"
                value={String(element.styles.justifyContent || "flex-start")}
                onChange={(v) => handleStyleChange("justifyContent", v)}
                options={[
                  { value: "flex-start", label: "Start" },
                  { value: "center", label: "Center" },
                  { value: "flex-end", label: "End" },
                  { value: "space-between", label: "Space Between" },
                  { value: "space-around", label: "Space Around" },
                  { value: "space-evenly", label: "Space Evenly" }
                ]}
              />
              <PropertySelect
                label="Align"
                value={String(element.styles.alignItems || "stretch")}
                onChange={(v) => handleStyleChange("alignItems", v)}
                options={[
                  { value: "flex-start", label: "Start" },
                  { value: "center", label: "Center" },
                  { value: "flex-end", label: "End" },
                  { value: "stretch", label: "Stretch" },
                  { value: "baseline", label: "Baseline" }
                ]}
              />
            </Box>
          )}

          {/* Gap */}
          <PropertyInput
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
        <Box sx={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* Width/Height */}
          <Box sx={{ display: "flex", gap: "12px" }}>
            <PropertyInput
              label="Width"
              value={String(element.styles.width || "")}
              onChange={(v) => handleStyleChange("width", v)}
              placeholder="Auto"
            />
            <PropertyInput
              label="Height"
              value={String(element.styles.height || "")}
              onChange={(v) => handleStyleChange("height", v)}
              placeholder="Auto"
            />
          </Box>

          {/* Min Width/Height */}
          <Box sx={{ display: "flex", gap: "12px" }}>
            <PropertyInput
              label="Min W"
              value={String(element.styles.minWidth || "")}
              onChange={(v) => handleStyleChange("minWidth", v)}
              placeholder="0"
            />
            <PropertyInput
              label="Min H"
              value={String(element.styles.minHeight || "")}
              onChange={(v) => handleStyleChange("minHeight", v)}
              placeholder="0"
            />
          </Box>

          {/* Max Width/Height */}
          <Box sx={{ display: "flex", gap: "12px" }}>
            <PropertyInput
              label="Max W"
              value={String(element.styles.maxWidth || "")}
              onChange={(v) => handleStyleChange("maxWidth", v)}
              placeholder="None"
            />
            <PropertyInput
              label="Max H"
              value={String(element.styles.maxHeight || "")}
              onChange={(v) => handleStyleChange("maxHeight", v)}
              placeholder="None"
            />
          </Box>

          {/* Overflow */}
          <Box>
            <Typography sx={labelSx}>Overflow</Typography>
            <ToggleButtonGroup
              value={currentOverflow}
              exclusive
              onChange={handleOverflowChange}
              size="small"
              sx={{
                "& .MuiToggleButton-root": {
                  px: 1.5,
                  py: 0.75,
                  border: `1px solid ${theme.vars.palette.divider}`,
                  "&.Mui-selected": {
                    backgroundColor: theme.vars.palette.primary.main,
                    color: theme.vars.palette.primary.contrastText
                  }
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
        <Box sx={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <PropertySelect
            label="Position"
            value={currentPosition}
            onChange={(v) => handleStyleChange("position", v)}
            options={[
              { value: "static", label: "Static" },
              { value: "relative", label: "Relative" },
              { value: "absolute", label: "Absolute" },
              { value: "fixed", label: "Fixed" },
              { value: "sticky", label: "Sticky" }
            ]}
          />

          {/* Position offsets (show when not static) */}
          {currentPosition !== "static" && (
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <PropertyInput
                label="Top"
                value={String(element.styles.top || "")}
                onChange={(v) => handleStyleChange("top", v)}
                placeholder="auto"
              />
              <PropertyInput
                label="Right"
                value={String(element.styles.right || "")}
                onChange={(v) => handleStyleChange("right", v)}
                placeholder="auto"
              />
              <PropertyInput
                label="Bottom"
                value={String(element.styles.bottom || "")}
                onChange={(v) => handleStyleChange("bottom", v)}
                placeholder="auto"
              />
              <PropertyInput
                label="Left"
                value={String(element.styles.left || "")}
                onChange={(v) => handleStyleChange("left", v)}
                placeholder="auto"
              />
            </Box>
          )}

          {/* Z-index */}
          <PropertyInput
            label="Z-Index"
            value={String(element.styles.zIndex || "")}
            onChange={(v) => handleStyleChange("zIndex", v)}
            placeholder="auto"
          />
        </Box>
      </Section>

      {/* Typography Section */}
      <Section title="Typography" defaultExpanded={expandedSections.typography}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* Font Family */}
          <PropertySelect
            label="Font"
            value={String(element.styles.fontFamily || "inherit")}
            onChange={(v) => handleStyleChange("fontFamily", v)}
            options={[
              { value: "inherit", label: "Inherit" },
              { value: "Arial, sans-serif", label: "Arial" },
              { value: "'Helvetica Neue', sans-serif", label: "Helvetica" },
              { value: "'Times New Roman', serif", label: "Times New Roman" },
              { value: "Georgia, serif", label: "Georgia" },
              { value: "'Courier New', monospace", label: "Courier New" },
              { value: "Roboto, sans-serif", label: "Roboto" },
              { value: "'Open Sans', sans-serif", label: "Open Sans" },
              { value: "system-ui, sans-serif", label: "System UI" }
            ]}
          />

          {/* Font Weight */}
          <PropertySelect
            label="Weight"
            value={String(element.styles.fontWeight || "400")}
            onChange={(v) => handleStyleChange("fontWeight", v)}
            options={[
              { value: "100", label: "100 - Thin" },
              { value: "200", label: "200 - Extra Light" },
              { value: "300", label: "300 - Light" },
              { value: "400", label: "400 - Normal" },
              { value: "500", label: "500 - Medium" },
              { value: "600", label: "600 - Semi Bold" },
              { value: "700", label: "700 - Bold" },
              { value: "800", label: "800 - Extra Bold" },
              { value: "900", label: "900 - Black" }
            ]}
          />

          {/* Font Size and Line Height */}
          <Box sx={{ display: "flex", gap: "12px" }}>
            <PropertyInput
              label="Size"
              value={String(element.styles.fontSize || "")}
              onChange={(v) => handleStyleChange("fontSize", v)}
              placeholder="16px"
            />
            <PropertyInput
              label="Line Height"
              value={String(element.styles.lineHeight || "")}
              onChange={(v) => handleStyleChange("lineHeight", v)}
              placeholder="1.5"
            />
          </Box>

          {/* Letter Spacing */}
          <PropertyInput
            label="Letter Spacing"
            value={String(element.styles.letterSpacing || "")}
            onChange={(v) => handleStyleChange("letterSpacing", v)}
            placeholder="normal"
          />

          {/* Text Align */}
          <Box>
            <Typography sx={labelSx}>Text Align</Typography>
            <ToggleButtonGroup
              value={currentTextAlign}
              exclusive
              onChange={handleTextAlignChange}
              size="small"
              sx={{
                "& .MuiToggleButton-root": {
                  px: 1.5,
                  py: 0.75,
                  border: `1px solid ${theme.vars.palette.divider}`,
                  "&.Mui-selected": {
                    backgroundColor: theme.vars.palette.primary.main,
                    color: theme.vars.palette.primary.contrastText
                  }
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
          <Box>
            <Typography sx={labelSx}>Color</Typography>
            <Box sx={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <TextField
                type="color"
                value={String(element.styles.color || "#000000")}
                onChange={(e) => handleStyleChange("color", e.target.value)}
                size="small"
                sx={{
                  width: 44,
                  "& .MuiOutlinedInput-root": {
                    padding: 0,
                    "& fieldset": { borderColor: theme.vars.palette.divider }
                  },
                  "& input": { 
                    padding: "6px", 
                    height: "28px", 
                    cursor: "pointer",
                    borderRadius: "4px"
                  }
                }}
              />
              <TextField
                value={String(element.styles.color || "")}
                onChange={(e) => handleStyleChange("color", e.target.value)}
                placeholder="#000000"
                size="small"
                sx={{
                  flex: 1,
                  "& .MuiOutlinedInput-root": {
                    fontSize: "0.8125rem",
                    backgroundColor: theme.vars.palette.background.paper,
                    "& fieldset": { borderColor: theme.vars.palette.divider }
                  },
                  "& input": { padding: "8px 12px" }
                }}
              />
            </Box>
          </Box>
        </Box>
      </Section>

      {/* Appearance Section */}
      <Section title="Appearance" defaultExpanded={expandedSections.appearance}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* Background Color */}
          <Box>
            <Typography sx={labelSx}>Background</Typography>
            <Box sx={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <TextField
                type="color"
                value={String(element.styles.backgroundColor || "#ffffff")}
                onChange={(e) => handleStyleChange("backgroundColor", e.target.value)}
                size="small"
                sx={{
                  width: 44,
                  "& .MuiOutlinedInput-root": {
                    padding: 0,
                    "& fieldset": { borderColor: theme.vars.palette.divider }
                  },
                  "& input": { 
                    padding: "6px", 
                    height: "28px", 
                    cursor: "pointer",
                    borderRadius: "4px"
                  }
                }}
              />
              <TextField
                value={String(element.styles.backgroundColor || "")}
                onChange={(e) => handleStyleChange("backgroundColor", e.target.value)}
                placeholder="transparent"
                size="small"
                sx={{
                  flex: 1,
                  "& .MuiOutlinedInput-root": {
                    fontSize: "0.8125rem",
                    backgroundColor: theme.vars.palette.background.paper,
                    "& fieldset": { borderColor: theme.vars.palette.divider }
                  },
                  "& input": { padding: "8px 12px" }
                }}
              />
            </Box>
          </Box>

          {/* Border Radius */}
          <PropertyInput
            label="Border Radius"
            value={String(element.styles.borderRadius || "")}
            onChange={(v) => handleStyleChange("borderRadius", v)}
            placeholder="0"
          />

          {/* Border */}
          <PropertyInput
            label="Border"
            value={String(element.styles.border || "")}
            onChange={(v) => handleStyleChange("border", v)}
            placeholder="none"
          />

          {/* Box Shadow */}
          <PropertyInput
            label="Box Shadow"
            value={String(element.styles.boxShadow || "")}
            onChange={(v) => handleStyleChange("boxShadow", v)}
            placeholder="none"
          />

          {/* Opacity */}
          <PropertyInput
            label="Opacity"
            value={String(element.styles.opacity || "")}
            onChange={(v) => handleStyleChange("opacity", v)}
            placeholder="1"
          />
        </Box>
      </Section>

      {/* Attributes Section */}
      <Section title="Attributes" defaultExpanded={false}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <PropertyInput
            label="ID"
            value={element.attributes.id || ""}
            onChange={(v) => handleAttributeChange("id", v)}
            placeholder="element-id"
          />
          <PropertyInput
            label="Class"
            value={element.attributes.class || ""}
            onChange={(v) => handleAttributeChange("class", v)}
            placeholder="class-name"
          />
          <PropertyInput
            label="Title"
            value={element.attributes.title || ""}
            onChange={(v) => handleAttributeChange("title", v)}
            placeholder="Element title"
          />

          {/* Tag-specific attributes */}
          {element.tag === "a" && (
            <>
              <PropertyInput
                label="Href"
                value={element.attributes.href || ""}
                onChange={(v) => handleAttributeChange("href", v)}
                placeholder="https://..."
              />
              <PropertyInput
                label="Target"
                value={element.attributes.target || ""}
                onChange={(v) => handleAttributeChange("target", v)}
                placeholder="_blank"
              />
            </>
          )}
          {element.tag === "img" && (
            <>
              <PropertyInput
                label="Src"
                value={element.attributes.src || ""}
                onChange={(v) => handleAttributeChange("src", v)}
                placeholder="image-url"
              />
              <PropertyInput
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
        <Box sx={{ display: "flex", flexDirection: "column", gap: "12px" }}>
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
                    p: 1.5,
                    mb: 1,
                    borderRadius: "6px",
                    backgroundColor: theme.vars.palette.background.paper,
                    border: `1px solid ${theme.vars.palette.divider}`
                  }}
                >
                  <LinkIcon fontSize="small" sx={{ color: theme.vars.palette.primary.main }} />
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: "0.8125rem", fontWeight: 500 }}>
                      {binding.propertyName}
                    </Typography>
                    <Typography sx={{ fontSize: "0.75rem", color: theme.vars.palette.c_gray2 }}>
                      → {binding.bindingType === "content" ? "content" : binding.attributeName || binding.styleProperty}
                    </Typography>
                  </Box>
                  <Chip 
                    label={binding.propertyType} 
                    size="small" 
                    variant="outlined" 
                    sx={{ fontSize: "0.625rem", height: "20px" }} 
                  />
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
            sx={{ 
              fontSize: "0.8125rem",
              borderColor: theme.vars.palette.divider,
              color: theme.vars.palette.c_gray1,
              "&:hover": {
                borderColor: theme.vars.palette.primary.main,
                backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.08)`
              }
            }}
          >
            Add Property Binding
          </Button>

          {/* Template syntax help */}
          <Box
            sx={{
              p: 1.5,
              backgroundColor: theme.vars.palette.background.paper,
              borderRadius: "6px",
              border: `1px solid ${theme.vars.palette.divider}`
            }}
          >
            <Typography sx={{ fontSize: "0.75rem", color: theme.vars.palette.c_gray2 }}>
              Use {"{{property_name}}"} in text content or attributes for dynamic values
            </Typography>
          </Box>
        </Box>
      </Section>
    </Box>
  );
};

export default PropertyEditor;
