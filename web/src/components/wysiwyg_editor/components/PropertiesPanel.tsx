/**
 * Properties Panel
 *
 * Displays and edits properties for the selected component.
 * Redesigned with professional collapsible sections and visual spacing editor.
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  Box,
  Typography,
  TextField,
  Select,
  MenuItem,
  Checkbox,
  Slider,
  FormControl,
  InputLabel,
  FormControlLabel,
  Stack,
  ToggleButtonGroup,
  ToggleButton,
  Collapse,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
} from "@mui/icons-material";
import { componentRegistry, PropDefinition } from "../types/registry";
import type { StructuredSx } from "../types/schema";
import { useWysiwygEditorStore } from "../hooks/useWysiwygEditorStore";

/**
 * Collapsible section component
 */
interface CollapsibleSectionProps {
  title: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  defaultExpanded = true,
  children,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
      <Box
        onClick={() => setExpanded(!expanded)}
        sx={{
          display: "flex",
          alignItems: "center",
          cursor: "pointer",
          py: 1,
          px: 1.5,
          "&:hover": {
            bgcolor: "action.hover",
          },
        }}
      >
        {expanded ? (
          <ExpandMoreIcon sx={{ fontSize: 16, mr: 0.5 }} />
        ) : (
          <ChevronRightIcon sx={{ fontSize: 16, mr: 0.5 }} />
        )}
        <Typography
          variant="caption"
          sx={{
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            fontSize: "0.7rem",
          }}
        >
          {title}
        </Typography>
      </Box>
      <Collapse in={expanded}>
        <Box sx={{ p: 1.5, pt: 0 }}>{children}</Box>
      </Collapse>
    </Box>
  );
};

/**
 * Props for individual property controls
 */
interface PropControlProps {
  propKey: string;
  definition: PropDefinition;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}

/**
 * Text input control
 */
const TextControl: React.FC<PropControlProps> = ({ propKey, definition, value, onChange }) => {
  return (
    <TextField
      label={definition.label}
      value={value || ""}
      onChange={(e) => onChange(propKey, e.target.value)}
      size="small"
      fullWidth
      helperText={definition.description}
      required={definition.required}
      multiline={propKey === "text" || propKey === "helperText"}
      rows={propKey === "text" || propKey === "helperText" ? 2 : 1}
    />
  );
};

/**
 * Number input control
 */
const NumberControl: React.FC<PropControlProps> = ({ propKey, definition, value, onChange }) => {
  return (
    <TextField
      label={definition.label}
      type="number"
      value={value ?? definition.default ?? ""}
      onChange={(e) => onChange(propKey, e.target.value ? Number(e.target.value) : undefined)}
      size="small"
      fullWidth
      inputProps={{
        min: definition.min,
        max: definition.max,
        step: definition.step,
      }}
      helperText={definition.description}
    />
  );
};

/**
 * Slider control
 */
const SliderControl: React.FC<PropControlProps> = ({ propKey, definition, value, onChange }) => {
  const displayValue = value ?? definition.default;
  return (
    <Box sx={{ px: 1 }}>
      <Typography variant="caption" color="text.secondary">
        {definition.label}: {String(displayValue ?? "")}
      </Typography>
      <Slider
        value={(value as number) ?? (definition.default as number) ?? 0}
        onChange={(_e, newValue) => onChange(propKey, newValue)}
        min={definition.min}
        max={definition.max}
        step={definition.step}
        size="small"
        marks
      />
    </Box>
  );
};

/**
 * Select dropdown control
 */
const SelectControl: React.FC<PropControlProps> = ({ propKey, definition, value, onChange }) => {
  return (
    <FormControl size="small" fullWidth>
      <InputLabel>{definition.label}</InputLabel>
      <Select
        value={value ?? definition.default ?? ""}
        onChange={(e) => onChange(propKey, e.target.value)}
        label={definition.label}
      >
        {definition.values?.map((option) => (
          <MenuItem key={option} value={option}>
            {option}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};

/**
 * Segmented button control
 */
const SegmentedControl: React.FC<PropControlProps> = ({ propKey, definition, value, onChange }) => {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
        {definition.label}
      </Typography>
      <ToggleButtonGroup
        value={value ?? definition.default}
        exclusive
        onChange={(_e, newValue) => {
          if (newValue !== null) {
            onChange(propKey, newValue);
          }
        }}
        size="small"
        fullWidth
      >
        {definition.values?.map((option) => (
          <ToggleButton key={option} value={option} sx={{ fontSize: "0.7rem", py: 0.5 }}>
            {option}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Box>
  );
};

/**
 * Checkbox control
 */
const CheckboxControl: React.FC<PropControlProps> = ({ propKey, definition, value, onChange }) => {
  return (
    <FormControlLabel
      control={
        <Checkbox
          checked={Boolean(value)}
          onChange={(e) => onChange(propKey, e.target.checked)}
          size="small"
        />
      }
      label={definition.label}
    />
  );
};

/**
 * Spacing control with responsive support
 */
interface SpacingControlProps {
  propKey: string;
  definition: PropDefinition;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}

const SpacingControl: React.FC<SpacingControlProps> = ({ propKey, definition, value, onChange }) => {
  const [responsive, setResponsive] = React.useState(typeof value === "object");

  const handleSimpleChange = (_e: Event, newValue: number | number[]) => {
    onChange(propKey, newValue as number);
  };

  const handleResponsiveChange = (breakpoint: string, newValue: number) => {
    const currentValue = (typeof value === "object" ? value : {}) as Record<string, number>;
    onChange(propKey, { ...currentValue, [breakpoint]: newValue });
  };

  if (responsive) {
    const currentValue = (typeof value === "object" ? value : {}) as Record<string, number>;
    const breakpoints = ["xs", "sm", "md", "lg", "xl"];

    return (
      <Box>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="caption" color="text.secondary">
            {definition.label}
          </Typography>
          <FormControlLabel
            control={
              <Checkbox
                checked={responsive}
                onChange={(e) => {
                  setResponsive(e.target.checked);
                  if (!e.target.checked) {
                    onChange(propKey, currentValue.xs ?? currentValue.md ?? 0);
                  }
                }}
                size="small"
              />
            }
            label="Responsive"
            sx={{ "& .MuiTypography-root": { fontSize: "0.7rem" } }}
          />
        </Stack>
        <Stack spacing={1}>
          {breakpoints.map((bp) => (
            <Stack key={bp} direction="row" alignItems="center" spacing={1}>
              <Typography variant="caption" sx={{ width: 24 }}>
                {bp}
              </Typography>
              <Slider
                value={currentValue[bp] ?? 0}
                onChange={(_e, val) => handleResponsiveChange(bp, val as number)}
                min={0}
                max={10}
                step={1}
                size="small"
                sx={{ flex: 1 }}
              />
              <Typography variant="caption" sx={{ width: 16 }}>
                {currentValue[bp] ?? 0}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Box>
    );
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="caption" color="text.secondary">
          {definition.label}: {(value as number) ?? 0}
        </Typography>
        <FormControlLabel
          control={
            <Checkbox
              checked={responsive}
              onChange={(e) => {
                setResponsive(e.target.checked);
                if (e.target.checked) {
                  onChange(propKey, { xs: value as number ?? 0 });
                }
              }}
              size="small"
            />
          }
          label="Responsive"
          sx={{ "& .MuiTypography-root": { fontSize: "0.7rem" } }}
        />
      </Stack>
      <Slider
        value={(value as number) ?? 0}
        onChange={handleSimpleChange}
        min={0}
        max={10}
        step={1}
        size="small"
        marks
      />
    </Box>
  );
};

/**
 * Visual Spacing Box Editor
 * A visual representation of margin/padding like in the screenshot
 */
interface SpacingBoxEditorProps {
  sx: StructuredSx | undefined;
  onChange: (sx: StructuredSx) => void;
}

const SpacingBoxEditor: React.FC<SpacingBoxEditorProps> = ({ sx, onChange }) => {
  const currentSx = sx || {};

  const handleSpacingChange = (key: keyof StructuredSx, value: string) => {
    const numValue = value === "" ? undefined : parseInt(value) || 0;
    onChange({ ...currentSx, [key]: numValue });
  };

  // Get numeric values for display
  const getValue = (key: keyof StructuredSx): string => {
    const val = currentSx[key];
    if (val === undefined || val === null) {
      return "0";
    }
    if (typeof val === "number") {
      return String(val);
    }
    return "0";
  };

  return (
    <Box sx={{ p: 1 }}>
      {/* Margin box - outer */}
      <Box
        sx={{
          position: "relative",
          bgcolor: "rgba(255, 183, 108, 0.15)",
          border: "1px dashed",
          borderColor: "rgba(255, 183, 108, 0.4)",
          borderRadius: 1,
          p: 1,
        }}
      >
        {/* Label for margin */}
        <Typography
          variant="caption"
          sx={{
            position: "absolute",
            top: 2,
            left: 8,
            fontSize: "0.6rem",
            color: "text.secondary",
            textTransform: "uppercase",
          }}
        >
          Margin
        </Typography>

        {/* Margin top */}
        <Box sx={{ display: "flex", justifyContent: "center", mb: 0.5 }}>
          <TextField
            value={getValue("mt")}
            onChange={(e) => handleSpacingChange("mt", e.target.value)}
            size="small"
            variant="standard"
            inputProps={{
              style: { textAlign: "center", width: 30, fontSize: "0.75rem" },
            }}
            sx={{ "& .MuiInput-underline:before": { borderBottom: "none" } }}
          />
        </Box>

        {/* Middle row with margin left, padding box, margin right */}
        <Box sx={{ display: "flex", alignItems: "stretch" }}>
          {/* Margin left */}
          <Box sx={{ display: "flex", alignItems: "center", width: 40 }}>
            <TextField
              value={getValue("ml")}
              onChange={(e) => handleSpacingChange("ml", e.target.value)}
              size="small"
              variant="standard"
              inputProps={{
                style: { textAlign: "center", width: 30, fontSize: "0.75rem" },
              }}
              sx={{ "& .MuiInput-underline:before": { borderBottom: "none" } }}
            />
          </Box>

          {/* Padding box - inner */}
          <Box
            sx={{
              flex: 1,
              bgcolor: "rgba(96, 165, 250, 0.15)",
              border: "1px dashed",
              borderColor: "rgba(96, 165, 250, 0.4)",
              borderRadius: 1,
              p: 1,
              minHeight: 60,
            }}
          >
            {/* Label for padding */}
            <Typography
              variant="caption"
              sx={{
                position: "relative",
                top: -4,
                left: 0,
                fontSize: "0.6rem",
                color: "text.secondary",
                textTransform: "uppercase",
              }}
            >
              Padding
            </Typography>

            {/* Padding top */}
            <Box sx={{ display: "flex", justifyContent: "center" }}>
              <TextField
                value={getValue("pt")}
                onChange={(e) => handleSpacingChange("pt", e.target.value)}
                size="small"
                variant="standard"
                inputProps={{
                  style: { textAlign: "center", width: 30, fontSize: "0.75rem" },
                }}
                sx={{ "& .MuiInput-underline:before": { borderBottom: "none" } }}
              />
            </Box>

            {/* Padding left + center + Padding right */}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <TextField
                value={getValue("pl")}
                onChange={(e) => handleSpacingChange("pl", e.target.value)}
                size="small"
                variant="standard"
                inputProps={{
                  style: { textAlign: "center", width: 30, fontSize: "0.75rem" },
                }}
                sx={{ "& .MuiInput-underline:before": { borderBottom: "none" } }}
              />
              <Box
                sx={{
                  width: 40,
                  height: 20,
                  bgcolor: "background.paper",
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 0.5,
                }}
              />
              <TextField
                value={getValue("pr")}
                onChange={(e) => handleSpacingChange("pr", e.target.value)}
                size="small"
                variant="standard"
                inputProps={{
                  style: { textAlign: "center", width: 30, fontSize: "0.75rem" },
                }}
                sx={{ "& .MuiInput-underline:before": { borderBottom: "none" } }}
              />
            </Box>

            {/* Padding bottom */}
            <Box sx={{ display: "flex", justifyContent: "center" }}>
              <TextField
                value={getValue("pb")}
                onChange={(e) => handleSpacingChange("pb", e.target.value)}
                size="small"
                variant="standard"
                inputProps={{
                  style: { textAlign: "center", width: 30, fontSize: "0.75rem" },
                }}
                sx={{ "& .MuiInput-underline:before": { borderBottom: "none" } }}
              />
            </Box>
          </Box>

          {/* Margin right */}
          <Box sx={{ display: "flex", alignItems: "center", width: 40, justifyContent: "flex-end" }}>
            <TextField
              value={getValue("mr")}
              onChange={(e) => handleSpacingChange("mr", e.target.value)}
              size="small"
              variant="standard"
              inputProps={{
                style: { textAlign: "center", width: 30, fontSize: "0.75rem" },
              }}
              sx={{ "& .MuiInput-underline:before": { borderBottom: "none" } }}
            />
          </Box>
        </Box>

        {/* Margin bottom */}
        <Box sx={{ display: "flex", justifyContent: "center", mt: 0.5 }}>
          <TextField
            value={getValue("mb")}
            onChange={(e) => handleSpacingChange("mb", e.target.value)}
            size="small"
            variant="standard"
            inputProps={{
              style: { textAlign: "center", width: 30, fontSize: "0.75rem" },
            }}
            sx={{ "& .MuiInput-underline:before": { borderBottom: "none" } }}
          />
        </Box>
      </Box>
    </Box>
  );
};

/**
 * SX Props Editor for structured styling
 */
interface SxEditorProps {
  sx: StructuredSx | undefined;
  onChange: (sx: StructuredSx) => void;
}

const SxEditor: React.FC<SxEditorProps> = ({ sx, onChange }) => {
  const currentSx = sx || {};

  const handleChange = (key: keyof StructuredSx, value: unknown) => {
    onChange({ ...currentSx, [key]: value });
  };

  const alignItemsOptions = ["flex-start", "center", "flex-end", "stretch", "baseline"];
  const justifyContentOptions = [
    "flex-start",
    "center",
    "flex-end",
    "space-between",
    "space-around",
    "space-evenly",
  ];
  const overflowOptions = ["visible", "hidden", "scroll", "auto"];

  return (
    <Box sx={{ overflow: "auto" }}>
      {/* Layout Section */}
      <CollapsibleSection title="Layout" defaultExpanded>
        <Stack spacing={1.5}>
          {/* Display */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block", fontSize: "0.7rem" }}>
              Display
            </Typography>
            <ToggleButtonGroup
              value={currentSx.display ?? "block"}
              exclusive
              onChange={(_e, newValue) => {
                if (newValue) {
                  handleChange("display", newValue);
                }
              }}
              size="small"
              fullWidth
            >
              <ToggleButton value="block" sx={{ fontSize: "0.65rem", py: 0.25 }}>Block</ToggleButton>
              <ToggleButton value="flex" sx={{ fontSize: "0.65rem", py: 0.25 }}>Flex</ToggleButton>
              <ToggleButton value="grid" sx={{ fontSize: "0.65rem", py: 0.25 }}>Grid</ToggleButton>
              <ToggleButton value="none" sx={{ fontSize: "0.65rem", py: 0.25 }}>None</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Stack>
      </CollapsibleSection>

      {/* Spacing Section */}
      <CollapsibleSection title="Spacing" defaultExpanded>
        <SpacingBoxEditor sx={sx} onChange={onChange} />
      </CollapsibleSection>

      {/* Size Section */}
      <CollapsibleSection title="Size" defaultExpanded={false}>
        <Stack spacing={1.5}>
          {/* Width & Height */}
          <Stack direction="row" spacing={1}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
                Width
              </Typography>
              <TextField
                value={currentSx.width ?? ""}
                onChange={(e) => handleChange("width", e.target.value || undefined)}
                size="small"
                fullWidth
                placeholder="Auto"
                sx={{ "& input": { fontSize: "0.75rem", py: 0.5 } }}
              />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
                Height
              </Typography>
              <TextField
                value={currentSx.height ?? ""}
                onChange={(e) => handleChange("height", e.target.value || undefined)}
                size="small"
                fullWidth
                placeholder="Auto"
                sx={{ "& input": { fontSize: "0.75rem", py: 0.5 } }}
              />
            </Box>
          </Stack>

          {/* Min Width & Min Height */}
          <Stack direction="row" spacing={1}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
                Min W
              </Typography>
              <TextField
                value={currentSx.minWidth ?? ""}
                onChange={(e) => handleChange("minWidth", e.target.value || undefined)}
                size="small"
                fullWidth
                placeholder="0"
                sx={{ "& input": { fontSize: "0.75rem", py: 0.5 } }}
              />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
                Min H
              </Typography>
              <TextField
                value={currentSx.minHeight ?? ""}
                onChange={(e) => handleChange("minHeight", e.target.value || undefined)}
                size="small"
                fullWidth
                placeholder="0"
                sx={{ "& input": { fontSize: "0.75rem", py: 0.5 } }}
              />
            </Box>
          </Stack>

          {/* Max Width & Max Height */}
          <Stack direction="row" spacing={1}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
                Max W
              </Typography>
              <TextField
                value={currentSx.maxWidth ?? ""}
                onChange={(e) => handleChange("maxWidth", e.target.value || undefined)}
                size="small"
                fullWidth
                placeholder="None"
                sx={{ "& input": { fontSize: "0.75rem", py: 0.5 } }}
              />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
                Max H
              </Typography>
              <TextField
                value={currentSx.maxHeight ?? ""}
                onChange={(e) => handleChange("maxHeight", e.target.value || undefined)}
                size="small"
                fullWidth
                placeholder="None"
                sx={{ "& input": { fontSize: "0.75rem", py: 0.5 } }}
              />
            </Box>
          </Stack>

          {/* Overflow */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block", fontSize: "0.7rem" }}>
              Overflow
            </Typography>
            <ToggleButtonGroup
              value={currentSx.overflow ?? "visible"}
              exclusive
              onChange={(_e, newValue) => {
                if (newValue) {
                  handleChange("overflow", newValue);
                }
              }}
              size="small"
              fullWidth
            >
              {overflowOptions.map((opt) => {
                // Render icon or text based on option
                const getOverflowContent = () => {
                  switch (opt) {
                    case "visible":
                      return <VisibilityIcon sx={{ fontSize: 14 }} />;
                    case "hidden":
                      return <VisibilityOffIcon sx={{ fontSize: 14 }} />;
                    default:
                      return opt.charAt(0).toUpperCase();
                  }
                };
                return (
                  <ToggleButton key={opt} value={opt} sx={{ fontSize: "0.6rem", py: 0.25 }}>
                    {getOverflowContent()}
                  </ToggleButton>
                );
              })}
            </ToggleButtonGroup>
          </Box>
        </Stack>
      </CollapsibleSection>

      {/* Position Section */}
      <CollapsibleSection title="Position" defaultExpanded={false}>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block", fontSize: "0.7rem" }}>
              Position
            </Typography>
            <FormControl size="small" fullWidth>
              <Select
                value={currentSx.position ?? "static"}
                onChange={(e) => handleChange("position", e.target.value || undefined)}
                sx={{ fontSize: "0.75rem" }}
              >
                <MenuItem value="static">Static</MenuItem>
                <MenuItem value="relative">Relative</MenuItem>
                <MenuItem value="absolute">Absolute</MenuItem>
                <MenuItem value="fixed">Fixed</MenuItem>
                <MenuItem value="sticky">Sticky</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </Stack>
      </CollapsibleSection>

      {/* Flex/Grid Section - Only show when display is flex or grid */}
      {(currentSx.display === "flex" || currentSx.display === "inline-flex") && (
        <CollapsibleSection title="Flex" defaultExpanded>
          <Stack spacing={1.5}>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block", fontSize: "0.7rem" }}>
                Align Items
              </Typography>
              <FormControl size="small" fullWidth>
                <Select
                  value={currentSx.alignItems ?? ""}
                  onChange={(e) => handleChange("alignItems", e.target.value || undefined)}
                  sx={{ fontSize: "0.75rem" }}
                >
                  <MenuItem value="">Default</MenuItem>
                  {alignItemsOptions.map((opt) => (
                    <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block", fontSize: "0.7rem" }}>
                Justify Content
              </Typography>
              <FormControl size="small" fullWidth>
                <Select
                  value={currentSx.justifyContent ?? ""}
                  onChange={(e) => handleChange("justifyContent", e.target.value || undefined)}
                  sx={{ fontSize: "0.75rem" }}
                >
                  <MenuItem value="">Default</MenuItem>
                  {justifyContentOptions.map((opt) => (
                    <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block", fontSize: "0.7rem" }}>
                Gap
              </Typography>
              <TextField
                type="number"
                value={currentSx.gap ?? ""}
                onChange={(e) => handleChange("gap", e.target.value ? Number(e.target.value) : undefined)}
                size="small"
                fullWidth
                inputProps={{ min: 0, max: 10, step: 1 }}
                sx={{ "& input": { fontSize: "0.75rem", py: 0.5 } }}
              />
            </Box>
          </Stack>
        </CollapsibleSection>
      )}
    </Box>
  );
};

/**
 * Render a control based on prop definition
 */
const PropControl: React.FC<PropControlProps> = (props) => {
  const { definition } = props;

  switch (definition.control) {
    case "text":
      return <TextControl {...props} />;
    case "number":
      return <NumberControl {...props} />;
    case "slider":
      return definition.responsive ? <SpacingControl {...props} /> : <SliderControl {...props} />;
    case "select":
      return <SelectControl {...props} />;
    case "segmented":
      return <SegmentedControl {...props} />;
    case "checkbox":
      return <CheckboxControl {...props} />;
    case "spacing":
      return <SpacingControl {...props} />;
    default:
      return <TextControl {...props} />;
  }
};

/**
 * Properties Panel component
 */
export const PropertiesPanel: React.FC = () => {
  const { selectedNodeId, getSelectedNode, updateNode } = useWysiwygEditorStore();

  const selectedNode = getSelectedNode();

  const handlePropChange = useCallback(
    (key: string, value: unknown) => {
      if (selectedNodeId) {
        updateNode(selectedNodeId, { [key]: value });
      }
    },
    [selectedNodeId, updateNode]
  );

  const handleSxChange = useCallback(
    (sx: StructuredSx) => {
      if (selectedNodeId) {
        updateNode(selectedNodeId, { sx });
      }
    },
    [selectedNodeId, updateNode]
  );

  const definition = useMemo(() => {
    if (!selectedNode) {
      return null;
    }
    return componentRegistry[selectedNode.type];
  }, [selectedNode]);

  if (!selectedNode || !definition) {
    return (
      <Box
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          borderLeft: 1,
          borderColor: "divider",
          p: 2,
        }}
      >
        <Typography variant="body2" color="text.secondary" align="center">
          Select a component to edit its properties
        </Typography>
      </Box>
    );
  }

  // Group props by category
  const propEntries = Object.entries(definition.props);

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        borderLeft: 1,
        borderColor: "divider",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 1.5,
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "rgba(255, 255, 255, 0.02)",
        }}
      >
        <Typography
          variant="caption"
          sx={{
            fontWeight: 600,
            textTransform: "uppercase",
            fontSize: "0.7rem",
            color: "primary.main",
          }}
        >
          {definition.label}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            display: "block",
            color: "text.secondary",
            fontSize: "0.65rem",
            mt: 0.25,
          }}
        >
          {definition.description}
        </Typography>
      </Box>

      {/* Scrollable content */}
      <Box sx={{ flex: 1, overflow: "auto" }}>
        {/* Component Props Section */}
        {propEntries.length > 0 && (
          <CollapsibleSection title="Properties" defaultExpanded>
            <Stack spacing={1.5}>
              {propEntries.map(([key, propDef]) => (
                <PropControl
                  key={key}
                  propKey={key}
                  definition={propDef}
                  value={selectedNode.props[key]}
                  onChange={handlePropChange}
                />
              ))}
            </Stack>
          </CollapsibleSection>
        )}

        {/* Style Section */}
        <SxEditor
          sx={selectedNode.props.sx as StructuredSx | undefined}
          onChange={handleSxChange}
        />
      </Box>

      {/* Footer with node ID */}
      <Box
        sx={{
          p: 1,
          borderTop: 1,
          borderColor: "divider",
          bgcolor: "rgba(255, 255, 255, 0.02)",
        }}
      >
        <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.6rem" }}>
          ID: {selectedNode.id.slice(0, 8)}...
        </Typography>
      </Box>
    </Box>
  );
};

export default PropertiesPanel;
