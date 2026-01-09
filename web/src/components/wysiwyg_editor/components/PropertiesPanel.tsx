/**
 * Properties Panel
 *
 * Displays and edits properties for the selected component.
 * Uses type-safe controls based on prop definitions.
 */

import React, { useCallback, useMemo } from "react";
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
  Divider,
  Tabs,
  Tab,
  ToggleButtonGroup,
  ToggleButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material";
import { ExpandMore as ExpandMoreIcon } from "@mui/icons-material";
import { componentRegistry, PropDefinition } from "../types/registry";
import type { StructuredSx, SpacingValue } from "../types/schema";
import { useWysiwygEditorStore } from "../hooks/useWysiwygEditorStore";

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

  const spacingProps: Array<{
    key: keyof StructuredSx;
    label: string;
  }> = [
    { key: "p", label: "Padding" },
    { key: "px", label: "Padding X" },
    { key: "py", label: "Padding Y" },
    { key: "m", label: "Margin" },
    { key: "mx", label: "Margin X" },
    { key: "my", label: "Margin Y" },
    { key: "gap", label: "Gap" },
  ];

  const displayOptions = ["flex", "block", "inline", "inline-flex", "none", "grid"];
  const alignItemsOptions = ["flex-start", "center", "flex-end", "stretch", "baseline"];
  const justifyContentOptions = [
    "flex-start",
    "center",
    "flex-end",
    "space-between",
    "space-around",
    "space-evenly",
  ];

  return (
    <Stack spacing={2}>
      {/* Spacing section */}
      <Accordion defaultExpanded disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="caption" fontWeight={600}>
            Spacing
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            {spacingProps.map(({ key, label }) => (
              <SpacingControl
                key={key}
                propKey={key}
                definition={{
                  type: "number",
                  control: "spacing",
                  label,
                  min: 0,
                  max: 10,
                  responsive: true,
                }}
                value={currentSx[key]}
                onChange={(_, val) => handleChange(key, val as SpacingValue)}
              />
            ))}
          </Stack>
        </AccordionDetails>
      </Accordion>

      {/* Layout section */}
      <Accordion disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="caption" fontWeight={600}>
            Layout
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <FormControl size="small" fullWidth>
              <InputLabel>Display</InputLabel>
              <Select
                value={currentSx.display ?? ""}
                onChange={(e) => handleChange("display", e.target.value || undefined)}
                label="Display"
              >
                <MenuItem value="">Default</MenuItem>
                {displayOptions.map((opt) => (
                  <MenuItem key={opt} value={opt}>
                    {opt}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth>
              <InputLabel>Align Items</InputLabel>
              <Select
                value={currentSx.alignItems ?? ""}
                onChange={(e) => handleChange("alignItems", e.target.value || undefined)}
                label="Align Items"
              >
                <MenuItem value="">Default</MenuItem>
                {alignItemsOptions.map((opt) => (
                  <MenuItem key={opt} value={opt}>
                    {opt}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth>
              <InputLabel>Justify Content</InputLabel>
              <Select
                value={currentSx.justifyContent ?? ""}
                onChange={(e) => handleChange("justifyContent", e.target.value || undefined)}
                label="Justify Content"
              >
                <MenuItem value="">Default</MenuItem>
                {justifyContentOptions.map((opt) => (
                  <MenuItem key={opt} value={opt}>
                    {opt}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </AccordionDetails>
      </Accordion>

      {/* Sizing section */}
      <Accordion disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="caption" fontWeight={600}>
            Sizing
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <TextField
              label="Width"
              value={currentSx.width ?? ""}
              onChange={(e) => handleChange("width", e.target.value || undefined)}
              size="small"
              fullWidth
              placeholder="auto, 100%, 200px"
            />
            <TextField
              label="Height"
              value={currentSx.height ?? ""}
              onChange={(e) => handleChange("height", e.target.value || undefined)}
              size="small"
              fullWidth
              placeholder="auto, 100%, 200px"
            />
            <TextField
              label="Min Width"
              value={currentSx.minWidth ?? ""}
              onChange={(e) => handleChange("minWidth", e.target.value || undefined)}
              size="small"
              fullWidth
            />
            <TextField
              label="Min Height"
              value={currentSx.minHeight ?? ""}
              onChange={(e) => handleChange("minHeight", e.target.value || undefined)}
              size="small"
              fullWidth
            />
          </Stack>
        </AccordionDetails>
      </Accordion>
    </Stack>
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
  const [activeTab, setActiveTab] = React.useState(0);

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
      <Box sx={{ p: 1, borderBottom: 1, borderColor: "divider" }}>
        <Typography variant="subtitle2">{definition.label}</Typography>
        <Typography variant="caption" color="text.secondary">
          {definition.description}
        </Typography>
      </Box>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_e, v) => setActiveTab(v)}
        variant="fullWidth"
        sx={{ borderBottom: 1, borderColor: "divider" }}
      >
        <Tab label="Props" sx={{ fontSize: "0.75rem", minHeight: 40 }} />
        <Tab label="Style" sx={{ fontSize: "0.75rem", minHeight: 40 }} />
      </Tabs>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: "auto", p: 1 }}>
        {activeTab === 0 && (
          <Stack spacing={2}>
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
        )}

        {activeTab === 1 && (
          <SxEditor
            sx={selectedNode.props.sx as StructuredSx | undefined}
            onChange={handleSxChange}
          />
        )}
      </Box>

      {/* Node ID (for debugging) */}
      <Divider />
      <Box sx={{ p: 1 }}>
        <Typography variant="caption" color="text.secondary">
          ID: {selectedNode.id.slice(0, 8)}...
        </Typography>
      </Box>
    </Box>
  );
};

export default PropertiesPanel;
