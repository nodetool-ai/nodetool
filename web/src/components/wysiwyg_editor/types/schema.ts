/**
 * MUI WYSIWYG Editor Schema Types
 *
 * This file defines the JSON schema types for representing a MUI component tree.
 * The schema is deterministic and produces clean configuration output.
 */

/**
 * Breakpoint-aware responsive value type
 */
export type ResponsiveValue<T> =
  | T
  | {
      xs?: T;
      sm?: T;
      md?: T;
      lg?: T;
      xl?: T;
    };

/**
 * MUI system spacing values (0-10)
 */
export type SpacingValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/**
 * Allowed MUI palette colors for backgroundColor
 */
export type PaletteColor =
  | "primary.main"
  | "primary.light"
  | "primary.dark"
  | "secondary.main"
  | "secondary.light"
  | "secondary.dark"
  | "error.main"
  | "warning.main"
  | "info.main"
  | "success.main"
  | "background.default"
  | "background.paper"
  | "grey.100"
  | "grey.200"
  | "grey.300"
  | "grey.400"
  | "grey.500"
  | "grey.600"
  | "grey.700"
  | "grey.800"
  | "grey.900";

/**
 * Structured sx prop - only MUI system props, no arbitrary CSS
 */
export interface StructuredSx {
  // Spacing
  m?: ResponsiveValue<SpacingValue>;
  mt?: ResponsiveValue<SpacingValue>;
  mr?: ResponsiveValue<SpacingValue>;
  mb?: ResponsiveValue<SpacingValue>;
  ml?: ResponsiveValue<SpacingValue>;
  mx?: ResponsiveValue<SpacingValue>;
  my?: ResponsiveValue<SpacingValue>;
  p?: ResponsiveValue<SpacingValue>;
  pt?: ResponsiveValue<SpacingValue>;
  pr?: ResponsiveValue<SpacingValue>;
  pb?: ResponsiveValue<SpacingValue>;
  pl?: ResponsiveValue<SpacingValue>;
  px?: ResponsiveValue<SpacingValue>;
  py?: ResponsiveValue<SpacingValue>;

  // Sizing
  width?: ResponsiveValue<string | number>;
  height?: ResponsiveValue<string | number>;
  minWidth?: ResponsiveValue<string | number>;
  minHeight?: ResponsiveValue<string | number>;
  maxWidth?: ResponsiveValue<string | number>;
  maxHeight?: ResponsiveValue<string | number>;

  // Display
  display?: ResponsiveValue<"flex" | "block" | "inline" | "inline-flex" | "none" | "grid">;

  // Flexbox
  flexDirection?: ResponsiveValue<"row" | "column" | "row-reverse" | "column-reverse">;
  alignItems?: ResponsiveValue<"flex-start" | "center" | "flex-end" | "stretch" | "baseline">;
  justifyContent?: ResponsiveValue<
    "flex-start" | "center" | "flex-end" | "space-between" | "space-around" | "space-evenly"
  >;
  flexWrap?: ResponsiveValue<"wrap" | "nowrap" | "wrap-reverse">;
  flex?: ResponsiveValue<number | string>;
  flexGrow?: ResponsiveValue<number>;
  flexShrink?: ResponsiveValue<number>;
  gap?: ResponsiveValue<SpacingValue>;

  // Grid
  gridTemplateColumns?: ResponsiveValue<string>;
  gridTemplateRows?: ResponsiveValue<string>;
  gridColumn?: ResponsiveValue<string>;
  gridRow?: ResponsiveValue<string>;

  // Colors (from theme palette only)
  backgroundColor?: ResponsiveValue<PaletteColor>;
  color?: ResponsiveValue<PaletteColor | "text.primary" | "text.secondary" | "text.disabled">;

  // Border
  borderRadius?: ResponsiveValue<SpacingValue>;

  // Text
  textAlign?: ResponsiveValue<"left" | "center" | "right" | "justify">;

  // Overflow
  overflow?: ResponsiveValue<"visible" | "hidden" | "scroll" | "auto">;
  overflowX?: ResponsiveValue<"visible" | "hidden" | "scroll" | "auto">;
  overflowY?: ResponsiveValue<"visible" | "hidden" | "scroll" | "auto">;
}

/**
 * Supported MUI component types
 */
export type MuiComponentType =
  // Layout
  | "Box"
  | "Stack"
  | "Grid"
  | "Divider"
  | "Paper"
  | "Container"
  // Typography
  | "Typography"
  | "Link"
  // Inputs
  | "TextField"
  | "Select"
  | "Checkbox"
  | "Radio"
  | "Switch"
  | "Slider"
  // Actions
  | "Button"
  | "IconButton"
  | "ButtonGroup"
  // Data Display
  | "Chip"
  | "Avatar"
  | "Badge"
  | "Tooltip"
  | "Alert"
  // Navigation
  | "Tabs"
  | "Tab"
  | "Breadcrumbs";

/**
 * Base props shared by all components
 */
export interface BaseComponentProps {
  sx?: StructuredSx;
}

/**
 * Layout component props
 */
export interface BoxProps extends BaseComponentProps {
  component?: "div" | "span" | "section" | "article" | "main" | "aside" | "header" | "footer" | "nav";
}

export interface StackProps extends BaseComponentProps {
  direction?: ResponsiveValue<"row" | "column" | "row-reverse" | "column-reverse">;
  spacing?: ResponsiveValue<SpacingValue>;
  divider?: boolean;
  alignItems?: "flex-start" | "center" | "flex-end" | "stretch" | "baseline";
  justifyContent?: "flex-start" | "center" | "flex-end" | "space-between" | "space-around" | "space-evenly";
}

export interface GridProps extends BaseComponentProps {
  container?: boolean;
  item?: boolean;
  spacing?: ResponsiveValue<SpacingValue>;
  columns?: ResponsiveValue<number>;
  size?: ResponsiveValue<number | "auto" | "grow">;
}

export interface DividerProps extends BaseComponentProps {
  orientation?: "horizontal" | "vertical";
  variant?: "fullWidth" | "inset" | "middle";
  textAlign?: "center" | "left" | "right";
  text?: string;
}

export interface PaperProps extends BaseComponentProps {
  elevation?: 0 | 1 | 2 | 3 | 4 | 6 | 8 | 12 | 16 | 24;
  variant?: "elevation" | "outlined";
  square?: boolean;
}

export interface ContainerProps extends BaseComponentProps {
  maxWidth?: "xs" | "sm" | "md" | "lg" | "xl" | false;
  fixed?: boolean;
  disableGutters?: boolean;
}

/**
 * Typography component props
 */
export interface TypographyProps extends BaseComponentProps {
  variant?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "subtitle1" | "subtitle2" | "body1" | "body2" | "caption" | "overline";
  text: string;
  align?: "left" | "center" | "right" | "justify";
  noWrap?: boolean;
  gutterBottom?: boolean;
  color?: "primary" | "secondary" | "error" | "warning" | "info" | "success" | "textPrimary" | "textSecondary";
}

export interface LinkProps extends BaseComponentProps {
  text: string;
  href: string;
  target?: "_blank" | "_self" | "_parent" | "_top";
  underline?: "none" | "hover" | "always";
  color?: "primary" | "secondary" | "error" | "inherit";
}

/**
 * Input component props
 */
export interface TextFieldProps extends BaseComponentProps {
  label?: string;
  placeholder?: string;
  helperText?: string;
  variant?: "outlined" | "filled" | "standard";
  size?: "small" | "medium";
  fullWidth?: boolean;
  multiline?: boolean;
  rows?: number;
  type?: "text" | "password" | "email" | "number" | "tel" | "url";
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  defaultValue?: string;
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends BaseComponentProps {
  label?: string;
  options: SelectOption[];
  variant?: "outlined" | "filled" | "standard";
  size?: "small" | "medium";
  fullWidth?: boolean;
  multiple?: boolean;
  required?: boolean;
  disabled?: boolean;
  defaultValue?: string | string[];
}

export interface CheckboxProps extends BaseComponentProps {
  label?: string;
  defaultChecked?: boolean;
  disabled?: boolean;
  size?: "small" | "medium";
  color?: "primary" | "secondary" | "error" | "info" | "success" | "warning" | "default";
}

export interface RadioProps extends BaseComponentProps {
  label?: string;
  value: string;
  disabled?: boolean;
  size?: "small" | "medium";
  color?: "primary" | "secondary" | "error" | "info" | "success" | "warning" | "default";
}

export interface SwitchProps extends BaseComponentProps {
  label?: string;
  defaultChecked?: boolean;
  disabled?: boolean;
  size?: "small" | "medium";
  color?: "primary" | "secondary" | "error" | "info" | "success" | "warning" | "default";
}

export interface SliderProps extends BaseComponentProps {
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number | number[];
  marks?: boolean;
  disabled?: boolean;
  size?: "small" | "medium";
  valueLabelDisplay?: "auto" | "on" | "off";
  orientation?: "horizontal" | "vertical";
}

/**
 * Action component props
 */
export interface ButtonProps extends BaseComponentProps {
  text: string;
  variant?: "text" | "contained" | "outlined";
  size?: "small" | "medium" | "large";
  color?: "primary" | "secondary" | "error" | "info" | "success" | "warning" | "inherit";
  disabled?: boolean;
  fullWidth?: boolean;
  startIcon?: string;
  endIcon?: string;
}

export interface IconButtonProps extends BaseComponentProps {
  icon: string;
  size?: "small" | "medium" | "large";
  color?: "primary" | "secondary" | "error" | "info" | "success" | "warning" | "default" | "inherit";
  disabled?: boolean;
  "aria-label": string;
}

export interface ButtonGroupProps extends BaseComponentProps {
  variant?: "text" | "contained" | "outlined";
  size?: "small" | "medium" | "large";
  color?: "primary" | "secondary" | "error" | "info" | "success" | "warning" | "inherit";
  orientation?: "horizontal" | "vertical";
  disabled?: boolean;
  fullWidth?: boolean;
}

/**
 * Data Display component props
 */
export interface ChipProps extends BaseComponentProps {
  label: string;
  variant?: "filled" | "outlined";
  size?: "small" | "medium";
  color?: "primary" | "secondary" | "error" | "info" | "success" | "warning" | "default";
  clickable?: boolean;
  deletable?: boolean;
  icon?: string;
  avatar?: string;
}

export interface AvatarProps extends BaseComponentProps {
  alt?: string;
  src?: string;
  text?: string;
  variant?: "circular" | "rounded" | "square";
  size?: number;
}

export interface BadgeProps extends BaseComponentProps {
  badgeContent?: string | number;
  color?: "primary" | "secondary" | "error" | "info" | "success" | "warning" | "default";
  variant?: "standard" | "dot";
  max?: number;
  invisible?: boolean;
  anchorOrigin?: {
    vertical: "top" | "bottom";
    horizontal: "left" | "right";
  };
}

export interface TooltipProps extends BaseComponentProps {
  title: string;
  placement?:
    | "top"
    | "top-start"
    | "top-end"
    | "bottom"
    | "bottom-start"
    | "bottom-end"
    | "left"
    | "left-start"
    | "left-end"
    | "right"
    | "right-start"
    | "right-end";
  arrow?: boolean;
}

export interface AlertProps extends BaseComponentProps {
  severity?: "error" | "warning" | "info" | "success";
  variant?: "standard" | "filled" | "outlined";
  title?: string;
  text: string;
  closable?: boolean;
  icon?: boolean;
}

/**
 * Navigation component props
 */
export interface TabsProps extends BaseComponentProps {
  value?: number;
  variant?: "standard" | "scrollable" | "fullWidth";
  orientation?: "horizontal" | "vertical";
  centered?: boolean;
  indicatorColor?: "primary" | "secondary";
  textColor?: "primary" | "secondary" | "inherit";
}

export interface TabProps extends BaseComponentProps {
  label: string;
  disabled?: boolean;
  icon?: string;
  iconPosition?: "top" | "bottom" | "start" | "end";
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbsProps extends BaseComponentProps {
  items: BreadcrumbItem[];
  separator?: string;
  maxItems?: number;
}

/**
 * Union type for all component props
 */
export type ComponentProps =
  | ({ type: "Box" } & BoxProps)
  | ({ type: "Stack" } & StackProps)
  | ({ type: "Grid" } & GridProps)
  | ({ type: "Divider" } & DividerProps)
  | ({ type: "Paper" } & PaperProps)
  | ({ type: "Container" } & ContainerProps)
  | ({ type: "Typography" } & TypographyProps)
  | ({ type: "Link" } & LinkProps)
  | ({ type: "TextField" } & TextFieldProps)
  | ({ type: "Select" } & SelectProps)
  | ({ type: "Checkbox" } & CheckboxProps)
  | ({ type: "Radio" } & RadioProps)
  | ({ type: "Switch" } & SwitchProps)
  | ({ type: "Slider" } & SliderProps)
  | ({ type: "Button" } & ButtonProps)
  | ({ type: "IconButton" } & IconButtonProps)
  | ({ type: "ButtonGroup" } & ButtonGroupProps)
  | ({ type: "Chip" } & ChipProps)
  | ({ type: "Avatar" } & AvatarProps)
  | ({ type: "Badge" } & BadgeProps)
  | ({ type: "Tooltip" } & TooltipProps)
  | ({ type: "Alert" } & AlertProps)
  | ({ type: "Tabs" } & TabsProps)
  | ({ type: "Tab" } & TabProps)
  | ({ type: "Breadcrumbs" } & BreadcrumbsProps);

/**
 * UI Schema node - represents a single component in the tree
 */
export interface UISchemaNode {
  id: string;
  type: MuiComponentType;
  props: Record<string, unknown>;
  children?: UISchemaNode[];
}

/**
 * Root UI Schema - the entire component tree
 */
export interface UISchema {
  root: UISchemaNode;
  version: "1.0";
}
