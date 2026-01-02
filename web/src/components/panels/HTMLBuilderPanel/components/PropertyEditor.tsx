/**
 * PropertyEditor Component
 *
 * Editor panel for modifying element properties, styles, and bindings.
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  Box,
  Typography,
  Tabs,
  Tab,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  IconButton,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
  Chip
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LinkIcon from "@mui/icons-material/Link";
import LinkOffIcon from "@mui/icons-material/LinkOff";
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
 * Tab panel component
 */
interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => {
  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      sx={{ p: 2, display: value !== index ? "none" : "block" }}
    >
      {value === index && children}
    </Box>
  );
};

/**
 * Font weight options for style select
 */
const FONT_WEIGHT_OPTIONS = [
  "normal", "bold", "100", "200", "300", "400", "500", "600", "700", "800", "900"
];

/**
 * Common style properties with their types
 */
const styleProperties = [
  { name: "width", label: "Width", type: "text" },
  { name: "height", label: "Height", type: "text" },
  { name: "padding", label: "Padding", type: "text" },
  { name: "margin", label: "Margin", type: "text" },
  { name: "backgroundColor", label: "Background", type: "color" },
  { name: "color", label: "Text Color", type: "color" },
  { name: "fontSize", label: "Font Size", type: "text" },
  { name: "fontWeight", label: "Font Weight", type: "select", options: FONT_WEIGHT_OPTIONS },
  { name: "textAlign", label: "Text Align", type: "select", options: ["left", "center", "right", "justify"] },
  { name: "display", label: "Display", type: "select", options: ["block", "inline", "flex", "grid", "inline-block", "none"] },
  { name: "flexDirection", label: "Flex Direction", type: "select", options: ["row", "column", "row-reverse", "column-reverse"] },
  { name: "justifyContent", label: "Justify Content", type: "select", options: ["flex-start", "flex-end", "center", "space-between", "space-around", "space-evenly"] },
  { name: "alignItems", label: "Align Items", type: "select", options: ["flex-start", "flex-end", "center", "stretch", "baseline"] },
  { name: "gap", label: "Gap", type: "text" },
  { name: "borderRadius", label: "Border Radius", type: "text" },
  { name: "border", label: "Border", type: "text" },
  { name: "boxShadow", label: "Box Shadow", type: "text" },
  { name: "opacity", label: "Opacity", type: "text" }
];

/**
 * PropertyEditor component
 */
export const PropertyEditor: React.FC<PropertyEditorProps> = ({
  element,
  onOpenBindingDialog
}) => {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState(0);

  // Store actions
  const updateElement = useHTMLBuilderStore((state) => state.updateElement);
  const updateElementStyles = useHTMLBuilderStore(
    (state) => state.updateElementStyles
  );
  const updateElementAttributes = useHTMLBuilderStore(
    (state) => state.updateElementAttributes
  );
  const unbindProperty = useHTMLBuilderStore((state) => state.unbindProperty);

  // Handle tab change
  const handleTabChange = useCallback(
    (_event: React.SyntheticEvent, newValue: number) => {
      setActiveTab(newValue);
    },
    []
  );

  // Handle text content change
  const handleTextContentChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (element) {
        updateElement(element.id, { textContent: event.target.value });
      }
    },
    [element, updateElement]
  );

  // Handle display name change
  const handleDisplayNameChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (element) {
        updateElement(element.id, { displayName: event.target.value });
      }
    },
    [element, updateElement]
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

  // Handle style change
  const handleStyleChange = useCallback(
    (styleName: string, value: string) => {
      if (element) {
        updateElementStyles(element.id, { [styleName]: value } as CSSProperties);
      }
    },
    [element, updateElementStyles]
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

  // Get common attributes for the element's tag
  const commonAttributes = useMemo(() => {
    if (!element) {return [];}

    const baseAttrs = ["id", "class", "title"];
    const tagSpecificAttrs: Record<string, string[]> = {
      a: ["href", "target"],
      img: ["src", "alt"],
      input: ["type", "name", "placeholder", "value"],
      textarea: ["name", "placeholder"],
      button: ["type"],
      video: ["src", "poster"],
      audio: ["src"],
      iframe: ["src"]
    };

    return [...baseAttrs, ...(tagSpecificAttrs[element.tag] || [])];
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

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Element info header */}
      <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Typography variant="subtitle2" fontWeight="bold">
          {element.displayName || element.tag.toUpperCase()}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          &lt;{element.tag}&gt;
        </Typography>
      </Box>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        variant="fullWidth"
        sx={{ borderBottom: `1px solid ${theme.palette.divider}` }}
      >
        <Tab label="Properties" />
        <Tab label="Styles" />
        <Tab label="Bindings" />
      </Tabs>

      {/* Properties Tab */}
      <TabPanel value={activeTab} index={0}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, overflow: "auto", maxHeight: "calc(100vh - 300px)" }}>
          {/* Display Name */}
          <TextField
            label="Display Name"
            value={element.displayName || ""}
            onChange={handleDisplayNameChange}
            size="small"
            fullWidth
          />

          {/* Text Content (if applicable) */}
          {!["img", "input", "br", "hr"].includes(element.tag) && (
            <TextField
              label="Text Content"
              value={element.textContent || ""}
              onChange={handleTextContentChange}
              size="small"
              fullWidth
              multiline={element.tag === "p" || element.tag === "textarea"}
              rows={element.tag === "p" || element.tag === "textarea" ? 3 : 1}
            />
          )}

          <Divider sx={{ my: 1 }} />

          {/* Common Attributes */}
          <Typography variant="subtitle2" gutterBottom>
            Attributes
          </Typography>
          {commonAttributes.map((attr) => (
            <TextField
              key={attr}
              label={attr}
              value={element.attributes[attr] || ""}
              onChange={(e) => handleAttributeChange(attr, e.target.value)}
              size="small"
              fullWidth
            />
          ))}
        </Box>
      </TabPanel>

      {/* Styles Tab */}
      <TabPanel value={activeTab} index={1}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, overflow: "auto", maxHeight: "calc(100vh - 300px)" }}>
          {/* Layout Section */}
          <Accordion defaultExpanded disableGutters elevation={0}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle2">Layout</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                {styleProperties
                  .filter((p) => ["width", "height", "padding", "margin", "display", "flexDirection", "justifyContent", "alignItems", "gap"].includes(p.name))
                  .map((prop) => (
                    <Box key={prop.name}>
                      {prop.type === "select" ? (
                        <FormControl size="small" fullWidth>
                          <InputLabel>{prop.label}</InputLabel>
                          <Select
                            label={prop.label}
                            value={String(element.styles[prop.name as keyof CSSProperties] || "")}
                            onChange={(e) => handleStyleChange(prop.name, e.target.value)}
                          >
                            <MenuItem value="">None</MenuItem>
                            {prop.options?.map((opt) => (
                              <MenuItem key={opt} value={opt}>
                                {opt}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      ) : (
                        <TextField
                          label={prop.label}
                          value={String(element.styles[prop.name as keyof CSSProperties] || "")}
                          onChange={(e) => handleStyleChange(prop.name, e.target.value)}
                          size="small"
                          fullWidth
                          type={prop.type === "color" ? "color" : "text"}
                        />
                      )}
                    </Box>
                  ))}
              </Box>
            </AccordionDetails>
          </Accordion>

          {/* Typography Section */}
          <Accordion disableGutters elevation={0}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle2">Typography</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                {styleProperties
                  .filter((p) => ["color", "fontSize", "fontWeight", "textAlign"].includes(p.name))
                  .map((prop) => (
                    <Box key={prop.name}>
                      {prop.type === "select" ? (
                        <FormControl size="small" fullWidth>
                          <InputLabel>{prop.label}</InputLabel>
                          <Select
                            label={prop.label}
                            value={String(element.styles[prop.name as keyof CSSProperties] || "")}
                            onChange={(e) => handleStyleChange(prop.name, e.target.value)}
                          >
                            <MenuItem value="">None</MenuItem>
                            {prop.options?.map((opt) => (
                              <MenuItem key={opt} value={opt}>
                                {opt}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      ) : (
                        <TextField
                          label={prop.label}
                          value={String(element.styles[prop.name as keyof CSSProperties] || "")}
                          onChange={(e) => handleStyleChange(prop.name, e.target.value)}
                          size="small"
                          fullWidth
                          type={prop.type === "color" ? "color" : "text"}
                        />
                      )}
                    </Box>
                  ))}
              </Box>
            </AccordionDetails>
          </Accordion>

          {/* Appearance Section */}
          <Accordion disableGutters elevation={0}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle2">Appearance</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                {styleProperties
                  .filter((p) => ["backgroundColor", "borderRadius", "border", "boxShadow", "opacity"].includes(p.name))
                  .map((prop) => (
                    <TextField
                      key={prop.name}
                      label={prop.label}
                      value={String(element.styles[prop.name as keyof CSSProperties] || "")}
                      onChange={(e) => handleStyleChange(prop.name, e.target.value)}
                      size="small"
                      fullWidth
                      type={prop.type === "color" ? "color" : "text"}
                    />
                  ))}
              </Box>
            </AccordionDetails>
          </Accordion>
        </Box>
      </TabPanel>

      {/* Bindings Tab */}
      <TabPanel value={activeTab} index={2}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, overflow: "auto", maxHeight: "calc(100vh - 300px)" }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Bind workflow properties to this element
          </Typography>

          {/* Existing bindings */}
          {Object.entries(element.propertyBindings).length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Active Bindings
              </Typography>
              {Object.entries(element.propertyBindings).map(
                ([key, binding]) => (
                  <Box
                    key={key}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      p: 1,
                      mb: 1,
                      borderRadius: 1,
                      backgroundColor: theme.palette.action.hover
                    }}
                  >
                    <LinkIcon fontSize="small" color="primary" />
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2">
                        {binding.propertyName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        → {binding.bindingType === "content" ? "content" : binding.attributeName || binding.styleProperty}
                      </Typography>
                    </Box>
                    <Chip
                      label={binding.propertyType}
                      size="small"
                      variant="outlined"
                    />
                    <Tooltip title="Remove binding">
                      <IconButton
                        size="small"
                        onClick={() => handleUnbind(key)}
                      >
                        <LinkOffIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                )
              )}
            </Box>
          )}

          {/* Add binding button */}
          <Button
            variant="outlined"
            startIcon={<LinkIcon />}
            onClick={() => onOpenBindingDialog?.(element.id, "content")}
          >
            Add Property Binding
          </Button>

          <Divider sx={{ my: 1 }} />

          {/* Template syntax help */}
          <Typography variant="subtitle2" gutterBottom>
            Template Syntax
          </Typography>
          <Typography variant="body2" color="text.secondary">
            You can also use template syntax in text content and attributes:
          </Typography>
          <Box
            sx={{
              p: 1.5,
              backgroundColor: theme.palette.action.hover,
              borderRadius: 1,
              fontFamily: "monospace",
              fontSize: "0.85em"
            }}
          >
            {"{{property_name}}"}
          </Box>
          <Typography variant="caption" color="text.secondary">
            Example: {"<p>Hello, {{user_name}}!</p>"}
          </Typography>
        </Box>
      </TabPanel>
    </Box>
  );
};

export default PropertyEditor;
