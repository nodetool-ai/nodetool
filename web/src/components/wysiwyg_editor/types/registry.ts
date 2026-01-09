/**
 * Component Registry
 *
 * Defines the component configuration for the WYSIWYG editor.
 * Each component has metadata about its props, child policies, and defaults.
 */

import type { MuiComponentType } from "./schema";

/**
 * Control types for property editors
 */
export type PropControlType =
  | "text"
  | "number"
  | "slider"
  | "select"
  | "segmented"
  | "checkbox"
  | "color"
  | "spacing"
  | "breakpoint";

/**
 * Property definition for a component prop
 */
export interface PropDefinition {
  type: "string" | "number" | "boolean" | "enum" | "object" | "array";
  control: PropControlType;
  label: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  // For number type
  min?: number;
  max?: number;
  step?: number;
  // For enum type
  values?: readonly string[];
  // For responsive props
  responsive?: boolean;
}

/**
 * Child policy for a component
 */
export type ChildPolicy =
  | "none" // Cannot have children
  | "any" // Can have any children
  | "single" // Can have exactly one child
  | "specific"; // Can only have specific child types

/**
 * Component definition in the registry
 */
export interface ComponentDefinition {
  type: MuiComponentType;
  category: "layout" | "typography" | "inputs" | "actions" | "dataDisplay" | "navigation";
  label: string;
  description: string;
  icon: string;
  props: Record<string, PropDefinition>;
  defaultProps: Record<string, unknown>;
  childPolicy: ChildPolicy;
  allowedChildren?: MuiComponentType[];
  allowedParents?: MuiComponentType[];
}

/**
 * Spacing prop definition (reusable)
 */
const spacingProp: PropDefinition = {
  type: "number",
  control: "slider",
  label: "Spacing",
  min: 0,
  max: 10,
  step: 1,
  responsive: true,
};

/**
 * Direction prop definition (reusable)
 */
const directionProp: PropDefinition = {
  type: "enum",
  control: "segmented",
  label: "Direction",
  values: ["row", "column", "row-reverse", "column-reverse"] as const,
  responsive: true,
};

/**
 * Size prop definition (reusable)
 */
const sizeProp: PropDefinition = {
  type: "enum",
  control: "segmented",
  label: "Size",
  values: ["small", "medium", "large"] as const,
};

/**
 * Color prop definition (reusable)
 */
const colorProp: PropDefinition = {
  type: "enum",
  control: "select",
  label: "Color",
  values: ["primary", "secondary", "error", "info", "success", "warning", "inherit"] as const,
};

/**
 * Variant prop definitions by component type
 */
const buttonVariantProp: PropDefinition = {
  type: "enum",
  control: "segmented",
  label: "Variant",
  values: ["text", "contained", "outlined"] as const,
};

const textFieldVariantProp: PropDefinition = {
  type: "enum",
  control: "segmented",
  label: "Variant",
  values: ["outlined", "filled", "standard"] as const,
};

const typographyVariantProp: PropDefinition = {
  type: "enum",
  control: "select",
  label: "Variant",
  values: ["h1", "h2", "h3", "h4", "h5", "h6", "subtitle1", "subtitle2", "body1", "body2", "caption", "overline"] as const,
};

/**
 * Component Registry - All supported MUI components and their configurations
 */
export const componentRegistry: Record<MuiComponentType, ComponentDefinition> = {
  // Layout Components
  Box: {
    type: "Box",
    category: "layout",
    label: "Box",
    description: "A basic container component for layout",
    icon: "SquareOutlined",
    props: {
      component: {
        type: "enum",
        control: "select",
        label: "HTML Element",
        values: ["div", "span", "section", "article", "main", "aside", "header", "footer", "nav"] as const,
      },
    },
    defaultProps: {
      component: "div",
    },
    childPolicy: "any",
  },

  Stack: {
    type: "Stack",
    category: "layout",
    label: "Stack",
    description: "Arrange children in a row or column with consistent spacing",
    icon: "ViewStreamOutlined",
    props: {
      direction: directionProp,
      spacing: spacingProp,
      alignItems: {
        type: "enum",
        control: "select",
        label: "Align Items",
        values: ["flex-start", "center", "flex-end", "stretch", "baseline"] as const,
      },
      justifyContent: {
        type: "enum",
        control: "select",
        label: "Justify Content",
        values: ["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"] as const,
      },
      divider: {
        type: "boolean",
        control: "checkbox",
        label: "Show Dividers",
      },
    },
    defaultProps: {
      direction: "column",
      spacing: 2,
    },
    childPolicy: "any",
  },

  Grid: {
    type: "Grid",
    category: "layout",
    label: "Grid",
    description: "A responsive grid layout system",
    icon: "GridOnOutlined",
    props: {
      container: {
        type: "boolean",
        control: "checkbox",
        label: "Container",
        description: "Make this a grid container",
      },
      item: {
        type: "boolean",
        control: "checkbox",
        label: "Item",
        description: "Make this a grid item",
      },
      spacing: spacingProp,
      columns: {
        type: "number",
        control: "slider",
        label: "Columns",
        min: 1,
        max: 12,
        step: 1,
        responsive: true,
      },
      size: {
        type: "number",
        control: "slider",
        label: "Size",
        min: 1,
        max: 12,
        step: 1,
        responsive: true,
        description: "Grid item size (1-12)",
      },
    },
    defaultProps: {
      container: true,
      spacing: 2,
    },
    childPolicy: "specific",
    allowedChildren: ["Grid"],
  },

  Divider: {
    type: "Divider",
    category: "layout",
    label: "Divider",
    description: "A horizontal or vertical separator",
    icon: "RemoveOutlined",
    props: {
      orientation: {
        type: "enum",
        control: "segmented",
        label: "Orientation",
        values: ["horizontal", "vertical"] as const,
      },
      variant: {
        type: "enum",
        control: "select",
        label: "Variant",
        values: ["fullWidth", "inset", "middle"] as const,
      },
      text: {
        type: "string",
        control: "text",
        label: "Text",
        description: "Optional text to display",
      },
      textAlign: {
        type: "enum",
        control: "segmented",
        label: "Text Align",
        values: ["center", "left", "right"] as const,
      },
    },
    defaultProps: {
      orientation: "horizontal",
      variant: "fullWidth",
    },
    childPolicy: "none",
  },

  Paper: {
    type: "Paper",
    category: "layout",
    label: "Paper",
    description: "A surface with elevation",
    icon: "NoteOutlined",
    props: {
      elevation: {
        type: "number",
        control: "slider",
        label: "Elevation",
        min: 0,
        max: 24,
        step: 1,
      },
      variant: {
        type: "enum",
        control: "segmented",
        label: "Variant",
        values: ["elevation", "outlined"] as const,
      },
      square: {
        type: "boolean",
        control: "checkbox",
        label: "Square Corners",
      },
    },
    defaultProps: {
      elevation: 1,
      variant: "elevation",
    },
    childPolicy: "any",
  },

  Container: {
    type: "Container",
    category: "layout",
    label: "Container",
    description: "Centers content horizontally with max-width",
    icon: "CropFreeOutlined",
    props: {
      maxWidth: {
        type: "enum",
        control: "select",
        label: "Max Width",
        values: ["xs", "sm", "md", "lg", "xl"] as const,
      },
      fixed: {
        type: "boolean",
        control: "checkbox",
        label: "Fixed Width",
      },
      disableGutters: {
        type: "boolean",
        control: "checkbox",
        label: "Disable Gutters",
      },
    },
    defaultProps: {
      maxWidth: "lg",
    },
    childPolicy: "any",
  },

  // Typography Components
  Typography: {
    type: "Typography",
    category: "typography",
    label: "Typography",
    description: "Display text with various styles",
    icon: "TextFieldsOutlined",
    props: {
      variant: typographyVariantProp,
      text: {
        type: "string",
        control: "text",
        label: "Text",
        required: true,
      },
      align: {
        type: "enum",
        control: "segmented",
        label: "Align",
        values: ["left", "center", "right", "justify"] as const,
      },
      noWrap: {
        type: "boolean",
        control: "checkbox",
        label: "No Wrap",
      },
      gutterBottom: {
        type: "boolean",
        control: "checkbox",
        label: "Gutter Bottom",
      },
      color: {
        type: "enum",
        control: "select",
        label: "Color",
        values: ["primary", "secondary", "error", "warning", "info", "success", "textPrimary", "textSecondary"] as const,
      },
    },
    defaultProps: {
      variant: "body1",
      text: "Text",
    },
    childPolicy: "none",
  },

  Link: {
    type: "Link",
    category: "typography",
    label: "Link",
    description: "A hyperlink component",
    icon: "LinkOutlined",
    props: {
      text: {
        type: "string",
        control: "text",
        label: "Text",
        required: true,
      },
      href: {
        type: "string",
        control: "text",
        label: "URL",
        required: true,
      },
      target: {
        type: "enum",
        control: "select",
        label: "Target",
        values: ["_blank", "_self", "_parent", "_top"] as const,
      },
      underline: {
        type: "enum",
        control: "segmented",
        label: "Underline",
        values: ["none", "hover", "always"] as const,
      },
      color: {
        type: "enum",
        control: "select",
        label: "Color",
        values: ["primary", "secondary", "error", "inherit"] as const,
      },
    },
    defaultProps: {
      text: "Link",
      href: "#",
      underline: "hover",
      color: "primary",
    },
    childPolicy: "none",
  },

  // Input Components
  TextField: {
    type: "TextField",
    category: "inputs",
    label: "Text Field",
    description: "A text input field",
    icon: "InputOutlined",
    props: {
      label: {
        type: "string",
        control: "text",
        label: "Label",
      },
      placeholder: {
        type: "string",
        control: "text",
        label: "Placeholder",
      },
      helperText: {
        type: "string",
        control: "text",
        label: "Helper Text",
      },
      variant: textFieldVariantProp,
      size: {
        type: "enum",
        control: "segmented",
        label: "Size",
        values: ["small", "medium"] as const,
      },
      fullWidth: {
        type: "boolean",
        control: "checkbox",
        label: "Full Width",
      },
      multiline: {
        type: "boolean",
        control: "checkbox",
        label: "Multiline",
      },
      rows: {
        type: "number",
        control: "number",
        label: "Rows",
        min: 1,
        max: 20,
      },
      type: {
        type: "enum",
        control: "select",
        label: "Type",
        values: ["text", "password", "email", "number", "tel", "url"] as const,
      },
      required: {
        type: "boolean",
        control: "checkbox",
        label: "Required",
      },
      disabled: {
        type: "boolean",
        control: "checkbox",
        label: "Disabled",
      },
      error: {
        type: "boolean",
        control: "checkbox",
        label: "Error State",
      },
      defaultValue: {
        type: "string",
        control: "text",
        label: "Default Value",
      },
    },
    defaultProps: {
      variant: "outlined",
      size: "medium",
      type: "text",
    },
    childPolicy: "none",
  },

  Select: {
    type: "Select",
    category: "inputs",
    label: "Select",
    description: "A dropdown selection input",
    icon: "ArrowDropDownCircleOutlined",
    props: {
      label: {
        type: "string",
        control: "text",
        label: "Label",
      },
      options: {
        type: "array",
        control: "text",
        label: "Options",
        description: "Comma-separated list of options",
      },
      variant: textFieldVariantProp,
      size: {
        type: "enum",
        control: "segmented",
        label: "Size",
        values: ["small", "medium"] as const,
      },
      fullWidth: {
        type: "boolean",
        control: "checkbox",
        label: "Full Width",
      },
      multiple: {
        type: "boolean",
        control: "checkbox",
        label: "Multiple Selection",
      },
      required: {
        type: "boolean",
        control: "checkbox",
        label: "Required",
      },
      disabled: {
        type: "boolean",
        control: "checkbox",
        label: "Disabled",
      },
    },
    defaultProps: {
      variant: "outlined",
      size: "medium",
      options: [
        { value: "option1", label: "Option 1" },
        { value: "option2", label: "Option 2" },
      ],
    },
    childPolicy: "none",
  },

  Checkbox: {
    type: "Checkbox",
    category: "inputs",
    label: "Checkbox",
    description: "A checkbox input",
    icon: "CheckBoxOutlined",
    props: {
      label: {
        type: "string",
        control: "text",
        label: "Label",
      },
      defaultChecked: {
        type: "boolean",
        control: "checkbox",
        label: "Default Checked",
      },
      disabled: {
        type: "boolean",
        control: "checkbox",
        label: "Disabled",
      },
      size: {
        type: "enum",
        control: "segmented",
        label: "Size",
        values: ["small", "medium"] as const,
      },
      color: colorProp,
    },
    defaultProps: {
      size: "medium",
      color: "primary",
    },
    childPolicy: "none",
  },

  Radio: {
    type: "Radio",
    category: "inputs",
    label: "Radio",
    description: "A radio button input",
    icon: "RadioButtonCheckedOutlined",
    props: {
      label: {
        type: "string",
        control: "text",
        label: "Label",
      },
      value: {
        type: "string",
        control: "text",
        label: "Value",
        required: true,
      },
      disabled: {
        type: "boolean",
        control: "checkbox",
        label: "Disabled",
      },
      size: {
        type: "enum",
        control: "segmented",
        label: "Size",
        values: ["small", "medium"] as const,
      },
      color: colorProp,
    },
    defaultProps: {
      value: "option",
      size: "medium",
      color: "primary",
    },
    childPolicy: "none",
  },

  Switch: {
    type: "Switch",
    category: "inputs",
    label: "Switch",
    description: "A toggle switch input",
    icon: "ToggleOnOutlined",
    props: {
      label: {
        type: "string",
        control: "text",
        label: "Label",
      },
      defaultChecked: {
        type: "boolean",
        control: "checkbox",
        label: "Default Checked",
      },
      disabled: {
        type: "boolean",
        control: "checkbox",
        label: "Disabled",
      },
      size: {
        type: "enum",
        control: "segmented",
        label: "Size",
        values: ["small", "medium"] as const,
      },
      color: colorProp,
    },
    defaultProps: {
      size: "medium",
      color: "primary",
    },
    childPolicy: "none",
  },

  Slider: {
    type: "Slider",
    category: "inputs",
    label: "Slider",
    description: "A slider input for numeric values",
    icon: "TuneOutlined",
    props: {
      min: {
        type: "number",
        control: "number",
        label: "Min",
      },
      max: {
        type: "number",
        control: "number",
        label: "Max",
      },
      step: {
        type: "number",
        control: "number",
        label: "Step",
      },
      defaultValue: {
        type: "number",
        control: "number",
        label: "Default Value",
      },
      marks: {
        type: "boolean",
        control: "checkbox",
        label: "Show Marks",
      },
      disabled: {
        type: "boolean",
        control: "checkbox",
        label: "Disabled",
      },
      size: {
        type: "enum",
        control: "segmented",
        label: "Size",
        values: ["small", "medium"] as const,
      },
      valueLabelDisplay: {
        type: "enum",
        control: "segmented",
        label: "Value Label",
        values: ["auto", "on", "off"] as const,
      },
      orientation: {
        type: "enum",
        control: "segmented",
        label: "Orientation",
        values: ["horizontal", "vertical"] as const,
      },
    },
    defaultProps: {
      min: 0,
      max: 100,
      defaultValue: 50,
      size: "medium",
      valueLabelDisplay: "auto",
      orientation: "horizontal",
    },
    childPolicy: "none",
  },

  // Action Components
  Button: {
    type: "Button",
    category: "actions",
    label: "Button",
    description: "A clickable button",
    icon: "SmartButtonOutlined",
    props: {
      text: {
        type: "string",
        control: "text",
        label: "Text",
        required: true,
      },
      variant: buttonVariantProp,
      size: sizeProp,
      color: colorProp,
      disabled: {
        type: "boolean",
        control: "checkbox",
        label: "Disabled",
      },
      fullWidth: {
        type: "boolean",
        control: "checkbox",
        label: "Full Width",
      },
      startIcon: {
        type: "string",
        control: "text",
        label: "Start Icon",
        description: "MUI icon name",
      },
      endIcon: {
        type: "string",
        control: "text",
        label: "End Icon",
        description: "MUI icon name",
      },
    },
    defaultProps: {
      text: "Button",
      variant: "contained",
      size: "medium",
      color: "primary",
    },
    childPolicy: "none",
  },

  IconButton: {
    type: "IconButton",
    category: "actions",
    label: "Icon Button",
    description: "A button with only an icon",
    icon: "TouchAppOutlined",
    props: {
      icon: {
        type: "string",
        control: "text",
        label: "Icon",
        required: true,
        description: "MUI icon name",
      },
      size: sizeProp,
      color: {
        type: "enum",
        control: "select",
        label: "Color",
        values: ["primary", "secondary", "error", "info", "success", "warning", "default", "inherit"] as const,
      },
      disabled: {
        type: "boolean",
        control: "checkbox",
        label: "Disabled",
      },
      "aria-label": {
        type: "string",
        control: "text",
        label: "Aria Label",
        required: true,
        description: "Accessible label for screen readers",
      },
    },
    defaultProps: {
      icon: "Add",
      size: "medium",
      color: "default",
      "aria-label": "action",
    },
    childPolicy: "none",
  },

  ButtonGroup: {
    type: "ButtonGroup",
    category: "actions",
    label: "Button Group",
    description: "A group of related buttons",
    icon: "ViewWeekOutlined",
    props: {
      variant: buttonVariantProp,
      size: sizeProp,
      color: colorProp,
      orientation: {
        type: "enum",
        control: "segmented",
        label: "Orientation",
        values: ["horizontal", "vertical"] as const,
      },
      disabled: {
        type: "boolean",
        control: "checkbox",
        label: "Disabled",
      },
      fullWidth: {
        type: "boolean",
        control: "checkbox",
        label: "Full Width",
      },
    },
    defaultProps: {
      variant: "contained",
      size: "medium",
      color: "primary",
      orientation: "horizontal",
    },
    childPolicy: "specific",
    allowedChildren: ["Button"],
  },

  // Data Display Components
  Chip: {
    type: "Chip",
    category: "dataDisplay",
    label: "Chip",
    description: "A compact element for information display",
    icon: "LabelOutlined",
    props: {
      label: {
        type: "string",
        control: "text",
        label: "Label",
        required: true,
      },
      variant: {
        type: "enum",
        control: "segmented",
        label: "Variant",
        values: ["filled", "outlined"] as const,
      },
      size: {
        type: "enum",
        control: "segmented",
        label: "Size",
        values: ["small", "medium"] as const,
      },
      color: colorProp,
      clickable: {
        type: "boolean",
        control: "checkbox",
        label: "Clickable",
      },
      deletable: {
        type: "boolean",
        control: "checkbox",
        label: "Deletable",
      },
      icon: {
        type: "string",
        control: "text",
        label: "Icon",
        description: "MUI icon name",
      },
    },
    defaultProps: {
      label: "Chip",
      variant: "filled",
      size: "medium",
      color: "primary",
    },
    childPolicy: "none",
  },

  Avatar: {
    type: "Avatar",
    category: "dataDisplay",
    label: "Avatar",
    description: "A circular image or text avatar",
    icon: "AccountCircleOutlined",
    props: {
      alt: {
        type: "string",
        control: "text",
        label: "Alt Text",
      },
      src: {
        type: "string",
        control: "text",
        label: "Image URL",
      },
      text: {
        type: "string",
        control: "text",
        label: "Text",
        description: "Fallback text (initials)",
      },
      variant: {
        type: "enum",
        control: "segmented",
        label: "Variant",
        values: ["circular", "rounded", "square"] as const,
      },
      size: {
        type: "number",
        control: "slider",
        label: "Size",
        min: 24,
        max: 120,
        step: 8,
      },
    },
    defaultProps: {
      variant: "circular",
      size: 40,
    },
    childPolicy: "none",
  },

  Badge: {
    type: "Badge",
    category: "dataDisplay",
    label: "Badge",
    description: "A small badge to display counts or status",
    icon: "NotificationsOutlined",
    props: {
      badgeContent: {
        type: "string",
        control: "text",
        label: "Content",
      },
      color: colorProp,
      variant: {
        type: "enum",
        control: "segmented",
        label: "Variant",
        values: ["standard", "dot"] as const,
      },
      max: {
        type: "number",
        control: "number",
        label: "Max",
        min: 1,
        max: 999,
      },
      invisible: {
        type: "boolean",
        control: "checkbox",
        label: "Invisible",
      },
    },
    defaultProps: {
      badgeContent: "1",
      color: "primary",
      variant: "standard",
      max: 99,
    },
    childPolicy: "single",
  },

  Tooltip: {
    type: "Tooltip",
    category: "dataDisplay",
    label: "Tooltip",
    description: "A tooltip to display on hover",
    icon: "InfoOutlined",
    props: {
      title: {
        type: "string",
        control: "text",
        label: "Title",
        required: true,
      },
      placement: {
        type: "enum",
        control: "select",
        label: "Placement",
        values: [
          "top", "top-start", "top-end",
          "bottom", "bottom-start", "bottom-end",
          "left", "left-start", "left-end",
          "right", "right-start", "right-end",
        ] as const,
      },
      arrow: {
        type: "boolean",
        control: "checkbox",
        label: "Show Arrow",
      },
    },
    defaultProps: {
      title: "Tooltip text",
      placement: "top",
      arrow: false,
    },
    childPolicy: "single",
  },

  Alert: {
    type: "Alert",
    category: "dataDisplay",
    label: "Alert",
    description: "An alert message component",
    icon: "WarningAmberOutlined",
    props: {
      severity: {
        type: "enum",
        control: "segmented",
        label: "Severity",
        values: ["error", "warning", "info", "success"] as const,
      },
      variant: {
        type: "enum",
        control: "segmented",
        label: "Variant",
        values: ["standard", "filled", "outlined"] as const,
      },
      title: {
        type: "string",
        control: "text",
        label: "Title",
      },
      text: {
        type: "string",
        control: "text",
        label: "Text",
        required: true,
      },
      closable: {
        type: "boolean",
        control: "checkbox",
        label: "Closable",
      },
      icon: {
        type: "boolean",
        control: "checkbox",
        label: "Show Icon",
      },
    },
    defaultProps: {
      severity: "info",
      variant: "standard",
      text: "This is an alert message",
      icon: true,
    },
    childPolicy: "none",
  },

  // Navigation Components
  Tabs: {
    type: "Tabs",
    category: "navigation",
    label: "Tabs",
    description: "Tab navigation component",
    icon: "TabOutlined",
    props: {
      value: {
        type: "number",
        control: "number",
        label: "Active Tab",
        min: 0,
      },
      variant: {
        type: "enum",
        control: "select",
        label: "Variant",
        values: ["standard", "scrollable", "fullWidth"] as const,
      },
      orientation: {
        type: "enum",
        control: "segmented",
        label: "Orientation",
        values: ["horizontal", "vertical"] as const,
      },
      centered: {
        type: "boolean",
        control: "checkbox",
        label: "Centered",
      },
      indicatorColor: {
        type: "enum",
        control: "segmented",
        label: "Indicator Color",
        values: ["primary", "secondary"] as const,
      },
      textColor: {
        type: "enum",
        control: "select",
        label: "Text Color",
        values: ["primary", "secondary", "inherit"] as const,
      },
    },
    defaultProps: {
      value: 0,
      variant: "standard",
      orientation: "horizontal",
      indicatorColor: "primary",
      textColor: "primary",
    },
    childPolicy: "specific",
    allowedChildren: ["Tab"],
  },

  Tab: {
    type: "Tab",
    category: "navigation",
    label: "Tab",
    description: "A single tab item",
    icon: "TabOutlined",
    props: {
      label: {
        type: "string",
        control: "text",
        label: "Label",
        required: true,
      },
      disabled: {
        type: "boolean",
        control: "checkbox",
        label: "Disabled",
      },
      icon: {
        type: "string",
        control: "text",
        label: "Icon",
        description: "MUI icon name",
      },
      iconPosition: {
        type: "enum",
        control: "select",
        label: "Icon Position",
        values: ["top", "bottom", "start", "end"] as const,
      },
    },
    defaultProps: {
      label: "Tab",
    },
    childPolicy: "none",
    allowedParents: ["Tabs"],
  },

  Breadcrumbs: {
    type: "Breadcrumbs",
    category: "navigation",
    label: "Breadcrumbs",
    description: "Navigation breadcrumb trail",
    icon: "NavigateNextOutlined",
    props: {
      items: {
        type: "array",
        control: "text",
        label: "Items",
        description: "Comma-separated list of breadcrumb labels",
      },
      separator: {
        type: "string",
        control: "text",
        label: "Separator",
      },
      maxItems: {
        type: "number",
        control: "number",
        label: "Max Items",
        min: 1,
        max: 10,
      },
    },
    defaultProps: {
      items: [
        { label: "Home", href: "/" },
        { label: "Category", href: "/category" },
        { label: "Current" },
      ],
      separator: "/",
    },
    childPolicy: "none",
  },
};

/**
 * Get components grouped by category
 */
export const getComponentsByCategory = () => {
  const categories: Record<string, ComponentDefinition[]> = {
    layout: [],
    typography: [],
    inputs: [],
    actions: [],
    dataDisplay: [],
    navigation: [],
  };

  Object.values(componentRegistry).forEach((component) => {
    categories[component.category].push(component);
  });

  return categories;
};

/**
 * Check if a component can be a child of another
 */
export const canBeChildOf = (childType: MuiComponentType, parentType: MuiComponentType): boolean => {
  const parent = componentRegistry[parentType];
  const child = componentRegistry[childType];

  // Check child policy
  if (parent.childPolicy === "none") {
    return false;
  }

  if (parent.childPolicy === "any") {
    return true;
  }

  if (parent.childPolicy === "specific" && parent.allowedChildren) {
    return parent.allowedChildren.includes(childType);
  }

  if (parent.childPolicy === "single") {
    return true;
  }

  // Check if child has parent restrictions
  if (child.allowedParents && !child.allowedParents.includes(parentType)) {
    return false;
  }

  return true;
};

export type { MuiComponentType };
