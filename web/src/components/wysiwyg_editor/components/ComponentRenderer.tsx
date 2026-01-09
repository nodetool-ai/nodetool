/**
 * Component Renderer
 *
 * Renders MUI components from the UI schema.
 * This component is used both in the canvas and for final output.
 */

import React, { forwardRef } from "react";
import {
  Box,
  Stack,
  Grid,
  Divider,
  Paper,
  Container,
  Typography,
  Link,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Checkbox,
  Radio,
  Switch,
  Slider,
  Button,
  IconButton,
  ButtonGroup,
  Chip,
  Avatar,
  Badge,
  Tooltip,
  Alert,
  AlertTitle,
  Tabs,
  Tab,
  Breadcrumbs,
  FormControlLabel,
} from "@mui/material";
import type { UISchemaNode, MuiComponentType, SelectOption } from "../types";

/**
 * Data attributes type for node identification
 */
interface NodeDataAttributes {
  "data-node-id": string;
  "data-node-type": string;
}

/**
 * Props for the component renderer
 */
interface ComponentRendererProps {
  node: UISchemaNode;
  isEditing?: boolean;
  onClick?: (nodeId: string, e: React.MouseEvent) => void;
  onDoubleClick?: (nodeId: string, e: React.MouseEvent) => void;
  onTextChange?: (nodeId: string, text: string) => void;
  selectedNodeId?: string | null;
  hoveredNodeId?: string | null;
  showOverlay?: boolean;
}

/**
 * Wrapper to add selection/hover styling and click handlers
 */
interface NodeWrapperProps {
  nodeId: string;
  nodeType: MuiComponentType;
  isSelected: boolean;
  isHovered: boolean;
  onClick?: (nodeId: string, e: React.MouseEvent) => void;
  onDoubleClick?: (nodeId: string, e: React.MouseEvent) => void;
  showOverlay: boolean;
  children: React.ReactNode;
  inline?: boolean;
}

const NodeWrapper: React.FC<NodeWrapperProps> = ({
  nodeId,
  nodeType,
  isSelected,
  isHovered,
  onClick,
  onDoubleClick,
  showOverlay,
  children,
  inline = false,
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.(nodeId, e);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDoubleClick?.(nodeId, e);
  };

  if (!showOverlay) {
    return <>{children}</>;
  }

  const boxStyles = {
    position: "relative" as const,
    outline: isSelected ? "2px solid #1976d2" : isHovered ? "1px dashed #90caf9" : "none",
    outlineOffset: "2px",
    cursor: "pointer",
    transition: "outline 0.15s ease",
    display: inline ? "inline-block" : undefined,
    "&::after": isSelected
      ? {
          content: `"${nodeType}"`,
          position: "absolute",
          top: "-20px",
          left: "0",
          backgroundColor: "#1976d2",
          color: "white",
          fontSize: "10px",
          padding: "2px 6px",
          borderRadius: "2px",
          zIndex: 1000,
        }
      : undefined,
  };

  return (
    <Box sx={boxStyles} onClick={handleClick} onDoubleClick={handleDoubleClick} data-wysiwyg-node={nodeId}>
      {children}
    </Box>
  );
};

/**
 * Render children nodes recursively
 */
const renderChildren = (
  children: UISchemaNode[] | undefined,
  props: Omit<ComponentRendererProps, "node">
): React.ReactNode[] => {
  if (!children || children.length === 0) {
    return [];
  }

  return children.map((child) => <ComponentRenderer key={child.id} node={child} {...props} />);
};

/**
 * Individual component renderers
 */
const renderBox = (
  node: UISchemaNode,
  childrenElements: React.ReactNode[],
  _commonProps: NodeDataAttributes
) => {
  const { component, sx } = node.props;
  return (
    <Box component={component as React.ElementType} sx={sx as object} >
      {childrenElements.length > 0 ? childrenElements : <Box sx={{ p: 2, opacity: 0.5 }}>Drop components here</Box>}
    </Box>
  );
};

const renderStack = (
  node: UISchemaNode,
  childrenElements: React.ReactNode[],
  _commonProps: NodeDataAttributes
) => {
  const { direction, spacing, alignItems, justifyContent, divider, sx } = node.props;
  return (
    <Stack
      direction={direction as "row" | "column" | undefined}
      spacing={spacing as number}
      alignItems={alignItems as string}
      justifyContent={justifyContent as string}
      divider={divider ? <Divider flexItem /> : undefined}
      sx={sx as object}
      
    >
      {childrenElements.length > 0 ? childrenElements : <Box sx={{ p: 2, opacity: 0.5 }}>Drop components here</Box>}
    </Stack>
  );
};

const renderGrid = (
  node: UISchemaNode,
  childrenElements: React.ReactNode[],
  _commonProps: NodeDataAttributes
) => {
  const { container, spacing, columns, size, sx } = node.props;
  return (
    <Grid
      container={container as boolean}
      spacing={spacing as number}
      columns={columns as number}
      size={size as number | "auto" | "grow"}
      sx={sx as object}
      
    >
      {childrenElements.length > 0 ? childrenElements : <Box sx={{ p: 2, opacity: 0.5 }}>Add Grid items</Box>}
    </Grid>
  );
};

const renderDivider = (node: UISchemaNode, _commonProps: NodeDataAttributes) => {
  const { orientation, variant, text, textAlign, sx } = node.props;
  return (
    <Divider
      orientation={orientation as "horizontal" | "vertical"}
      variant={variant as "fullWidth" | "inset" | "middle"}
      textAlign={textAlign as "center" | "left" | "right"}
      sx={sx as object}
      
    >
      {text as string}
    </Divider>
  );
};

const renderPaper = (
  node: UISchemaNode,
  childrenElements: React.ReactNode[],
  _commonProps: NodeDataAttributes
) => {
  const { elevation, variant, square, sx } = node.props;
  return (
    <Paper
      elevation={elevation as number}
      variant={variant as "elevation" | "outlined"}
      square={square as boolean}
      sx={sx as object}
      
    >
      {childrenElements.length > 0 ? childrenElements : <Box sx={{ p: 2, opacity: 0.5 }}>Drop components here</Box>}
    </Paper>
  );
};

const renderContainer = (
  node: UISchemaNode,
  childrenElements: React.ReactNode[],
  _commonProps: NodeDataAttributes
) => {
  const { maxWidth, fixed, disableGutters, sx } = node.props;
  return (
    <Container
      maxWidth={maxWidth as "xs" | "sm" | "md" | "lg" | "xl" | false}
      fixed={fixed as boolean}
      disableGutters={disableGutters as boolean}
      sx={sx as object}
      
    >
      {childrenElements.length > 0 ? childrenElements : <Box sx={{ p: 2, opacity: 0.5 }}>Drop components here</Box>}
    </Container>
  );
};

const renderTypography = (
  node: UISchemaNode,
  _commonProps: NodeDataAttributes,
  isEditing?: boolean,
  onTextChange?: (nodeId: string, text: string) => void
) => {
  const { variant, text, align, noWrap, gutterBottom, color, sx } = node.props;

  // Inline editing for Typography
  if (isEditing && onTextChange) {
    return (
      <Typography
        variant={variant as "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "body1" | "body2"}
        align={align as "left" | "center" | "right" | "justify"}
        noWrap={noWrap as boolean}
        gutterBottom={gutterBottom as boolean}
        color={color as string}
        sx={{ ...((sx as object) || {}), cursor: "text" }}
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => onTextChange(node.id, e.currentTarget.textContent || "")}
        
      >
        {text as string}
      </Typography>
    );
  }

  return (
    <Typography
      variant={variant as "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "body1" | "body2"}
      align={align as "left" | "center" | "right" | "justify"}
      noWrap={noWrap as boolean}
      gutterBottom={gutterBottom as boolean}
      color={color as string}
      sx={sx as object}
      
    >
      {text as string}
    </Typography>
  );
};

const renderLink = (node: UISchemaNode, _commonProps: NodeDataAttributes) => {
  const { text, href, target, underline, color, sx } = node.props;
  return (
    <Link
      href={href as string}
      target={target as string}
      underline={underline as "none" | "hover" | "always"}
      color={color as string}
      sx={sx as object}
      
    >
      {text as string}
    </Link>
  );
};

const renderTextField = (node: UISchemaNode, _commonProps: NodeDataAttributes) => {
  const {
    label,
    placeholder,
    helperText,
    variant,
    size,
    fullWidth,
    multiline,
    rows,
    type,
    required,
    disabled,
    error,
    defaultValue,
    sx,
  } = node.props;

  return (
    <TextField
      label={label as string}
      placeholder={placeholder as string}
      helperText={helperText as string}
      variant={variant as "outlined" | "filled" | "standard"}
      size={size as "small" | "medium"}
      fullWidth={fullWidth as boolean}
      multiline={multiline as boolean}
      rows={rows as number}
      type={type as string}
      required={required as boolean}
      disabled={disabled as boolean}
      error={error as boolean}
      defaultValue={defaultValue as string}
      sx={sx as object}
      
    />
  );
};

const renderSelect = (node: UISchemaNode, _commonProps: NodeDataAttributes) => {
  const { label, options, variant, size, fullWidth, multiple, required, disabled, defaultValue, sx } = node.props;
  const selectOptions = (options as SelectOption[]) || [];
  const labelId = `select-label-${node.id}`;
  const labelText = label as string | undefined;

  return (
    <FormControl variant={variant as "outlined" | "filled" | "standard"} size={size as "small" | "medium"} fullWidth={fullWidth as boolean} sx={sx as object}>
      {labelText && <InputLabel id={labelId}>{labelText}</InputLabel>}
      <Select
        labelId={labelId}
        label={labelText}
        multiple={multiple as boolean}
        required={required as boolean}
        disabled={disabled as boolean}
        defaultValue={defaultValue as string | string[]}
      >
        {selectOptions.map((opt) => (
          <MenuItem key={opt.value} value={opt.value}>
            {opt.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};

const renderCheckbox = (node: UISchemaNode, _commonProps: NodeDataAttributes) => {
  const { label, defaultChecked, disabled, size, color, sx } = node.props;

  if (label) {
    return (
      <FormControlLabel
        control={
          <Checkbox
            defaultChecked={defaultChecked as boolean}
            disabled={disabled as boolean}
            size={size as "small" | "medium"}
            color={color as "primary" | "secondary" | "default"}
          />
        }
        label={label as string}
        sx={sx as object}
        
      />
    );
  }

  return (
    <Checkbox
      defaultChecked={defaultChecked as boolean}
      disabled={disabled as boolean}
      size={size as "small" | "medium"}
      color={color as "primary" | "secondary" | "default"}
      sx={sx as object}
      
    />
  );
};

const renderRadio = (node: UISchemaNode, _commonProps: NodeDataAttributes) => {
  const { label, value, disabled, size, color, sx } = node.props;

  if (label) {
    return (
      <FormControlLabel
        control={
          <Radio
            value={value as string}
            disabled={disabled as boolean}
            size={size as "small" | "medium"}
            color={color as "primary" | "secondary" | "default"}
          />
        }
        label={label as string}
        sx={sx as object}
        
      />
    );
  }

  return (
    <Radio
      value={value as string}
      disabled={disabled as boolean}
      size={size as "small" | "medium"}
      color={color as "primary" | "secondary" | "default"}
      sx={sx as object}
      
    />
  );
};

const renderSwitch = (node: UISchemaNode, _commonProps: NodeDataAttributes) => {
  const { label, defaultChecked, disabled, size, color, sx } = node.props;

  if (label) {
    return (
      <FormControlLabel
        control={
          <Switch
            defaultChecked={defaultChecked as boolean}
            disabled={disabled as boolean}
            size={size as "small" | "medium"}
            color={color as "primary" | "secondary" | "default"}
          />
        }
        label={label as string}
        sx={sx as object}
        
      />
    );
  }

  return (
    <Switch
      defaultChecked={defaultChecked as boolean}
      disabled={disabled as boolean}
      size={size as "small" | "medium"}
      color={color as "primary" | "secondary" | "default"}
      sx={sx as object}
      
    />
  );
};

const renderSlider = (node: UISchemaNode, _commonProps: NodeDataAttributes) => {
  const { min, max, step, defaultValue, marks, disabled, size, valueLabelDisplay, orientation, sx } = node.props;

  return (
    <Slider
      min={min as number}
      max={max as number}
      step={step as number}
      defaultValue={defaultValue as number}
      marks={marks as boolean}
      disabled={disabled as boolean}
      size={size as "small" | "medium"}
      valueLabelDisplay={valueLabelDisplay as "auto" | "on" | "off"}
      orientation={orientation as "horizontal" | "vertical"}
      sx={sx as object}
      
    />
  );
};

const renderButton = (
  node: UISchemaNode,
  _commonProps: NodeDataAttributes,
  isEditing?: boolean,
  onTextChange?: (nodeId: string, text: string) => void
) => {
  const { text, variant, size, color, disabled, fullWidth, sx } = node.props;

  // Inline editing for Button text
  if (isEditing && onTextChange) {
    return (
      <Button
        variant={variant as "text" | "contained" | "outlined"}
        size={size as "small" | "medium" | "large"}
        color={color as "primary" | "secondary" | "error" | "inherit"}
        disabled={disabled as boolean}
        fullWidth={fullWidth as boolean}
        sx={{ ...((sx as object) || {}), cursor: "text" }}
        
      >
        <span
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => onTextChange(node.id, e.currentTarget.textContent || "")}
          style={{ outline: "none" }}
        >
          {text as string}
        </span>
      </Button>
    );
  }

  return (
    <Button
      variant={variant as "text" | "contained" | "outlined"}
      size={size as "small" | "medium" | "large"}
      color={color as "primary" | "secondary" | "error" | "inherit"}
      disabled={disabled as boolean}
      fullWidth={fullWidth as boolean}
      sx={sx as object}
      
    >
      {text as string}
    </Button>
  );
};

const renderIconButton = (node: UISchemaNode, _commonProps: NodeDataAttributes) => {
  const { size, color, disabled, sx } = node.props;
  const ariaLabel = node.props["aria-label"] as string;

  return (
    <IconButton
      size={size as "small" | "medium" | "large"}
      color={color as "primary" | "secondary" | "default" | "inherit"}
      disabled={disabled as boolean}
      aria-label={ariaLabel}
      sx={sx as object}
      
    >
      {/* Icon placeholder - in real implementation would use MUI icons */}
      <span>⬤</span>
    </IconButton>
  );
};

const renderButtonGroup = (
  node: UISchemaNode,
  childrenElements: React.ReactNode[],
  _commonProps: NodeDataAttributes
) => {
  const { variant, size, color, orientation, disabled, fullWidth, sx } = node.props;

  return (
    <ButtonGroup
      variant={variant as "text" | "contained" | "outlined"}
      size={size as "small" | "medium" | "large"}
      color={color as "primary" | "secondary" | "error" | "inherit"}
      orientation={orientation as "horizontal" | "vertical"}
      disabled={disabled as boolean}
      fullWidth={fullWidth as boolean}
      sx={sx as object}
      
    >
      {childrenElements.length > 0 ? childrenElements : <Button>Button 1</Button>}
    </ButtonGroup>
  );
};

const renderChip = (node: UISchemaNode, _commonProps: NodeDataAttributes) => {
  const { label, variant, size, color, clickable, deletable, sx } = node.props;

  return (
    <Chip
      label={label as string}
      variant={variant as "filled" | "outlined"}
      size={size as "small" | "medium"}
      color={color as "primary" | "secondary" | "default"}
      clickable={clickable as boolean}
      onDelete={deletable ? () => {} : undefined}
      sx={sx as object}
      
    />
  );
};

const renderAvatar = (node: UISchemaNode, _commonProps: NodeDataAttributes) => {
  const { alt, src, text, variant, size: avatarSize, sx } = node.props;

  return (
    <Avatar
      alt={alt as string}
      src={src as string}
      variant={variant as "circular" | "rounded" | "square"}
      sx={{ width: avatarSize as number, height: avatarSize as number, ...((sx as object) || {}) }}
      
    >
      {text as string}
    </Avatar>
  );
};

const renderBadge = (
  node: UISchemaNode,
  childrenElements: React.ReactNode[],
  _commonProps: NodeDataAttributes
) => {
  const { badgeContent, color, variant, max, invisible, sx } = node.props;

  return (
    <Badge
      badgeContent={badgeContent as string | number}
      color={color as "primary" | "secondary" | "default" | "error"}
      variant={variant as "standard" | "dot"}
      max={max as number}
      invisible={invisible as boolean}
      sx={sx as object}
      
    >
      {childrenElements.length > 0 ? childrenElements : <Box sx={{ width: 40, height: 40, bgcolor: "grey.300" }} />}
    </Badge>
  );
};

const renderTooltip = (
  node: UISchemaNode,
  childrenElements: React.ReactNode[],
  _commonProps: NodeDataAttributes
) => {
  const { title, placement, arrow, sx } = node.props;

  return (
    <Tooltip
      title={title as string}
      placement={placement as "top" | "bottom" | "left" | "right"}
      arrow={arrow as boolean}
      
    >
      <Box sx={sx as object}>
        {childrenElements.length > 0 ? childrenElements : <Button>Hover me</Button>}
      </Box>
    </Tooltip>
  );
};

const renderAlert = (node: UISchemaNode, _commonProps: NodeDataAttributes) => {
  const { severity, variant, title, text, closable, icon, sx } = node.props;
  const titleText = title as string | undefined;
  const bodyText = text as string;

  return (
    <Alert
      severity={severity as "error" | "warning" | "info" | "success"}
      variant={variant as "standard" | "filled" | "outlined"}
      onClose={closable ? () => {} : undefined}
      icon={icon === false ? false : undefined}
      sx={sx as object}
    >
      {titleText && <AlertTitle>{titleText}</AlertTitle>}
      {bodyText}
    </Alert>
  );
};

const renderTabs = (
  node: UISchemaNode,
  childrenElements: React.ReactNode[],
  _commonProps: NodeDataAttributes
) => {
  const { value, variant, orientation, centered, indicatorColor, textColor, sx } = node.props;

  return (
    <Tabs
      value={value as number}
      variant={variant as "standard" | "scrollable" | "fullWidth"}
      orientation={orientation as "horizontal" | "vertical"}
      centered={centered as boolean}
      indicatorColor={indicatorColor as "primary" | "secondary"}
      textColor={textColor as "primary" | "secondary" | "inherit"}
      sx={sx as object}
      
    >
      {childrenElements.length > 0 ? childrenElements : <Tab label="Tab 1" />}
    </Tabs>
  );
};

const renderTab = (node: UISchemaNode, _commonProps: NodeDataAttributes) => {
  const { label, disabled, iconPosition, sx } = node.props;

  return (
    <Tab
      label={label as string}
      disabled={disabled as boolean}
      iconPosition={iconPosition as "top" | "bottom" | "start" | "end"}
      sx={sx as object}
      
    />
  );
};

interface BreadcrumbItem {
  label: string;
  href?: string;
}

const renderBreadcrumbs = (node: UISchemaNode, _commonProps: NodeDataAttributes) => {
  const { items, separator, maxItems, sx } = node.props;
  const breadcrumbItems = (items as BreadcrumbItem[]) || [];

  return (
    <Breadcrumbs separator={separator as string} maxItems={maxItems as number} sx={sx as object} >
      {breadcrumbItems.map((item, index) =>
        item.href ? (
          <Link key={index} href={item.href} underline="hover">
            {item.label}
          </Link>
        ) : (
          <Typography key={index}>{item.label}</Typography>
        )
      )}
    </Breadcrumbs>
  );
};

/**
 * Main component renderer
 */
export const ComponentRenderer = forwardRef<HTMLDivElement, ComponentRendererProps>(
  (
    { node, isEditing, onClick, onDoubleClick, onTextChange, selectedNodeId, hoveredNodeId, showOverlay = false },
    _ref
  ) => {
    const isSelected = selectedNodeId === node.id;
    const isHovered = hoveredNodeId === node.id;

    // Common props to pass for node data attributes
    const commonProps: NodeDataAttributes = {
      "data-node-id": node.id,
      "data-node-type": node.type,
    };

    // Render children
    const childProps = {
      isEditing,
      onClick,
      onDoubleClick,
      onTextChange,
      selectedNodeId,
      hoveredNodeId,
      showOverlay,
    };
    const childrenElements = renderChildren(node.children, childProps);

    // Determine if component should be inline
    const inlineTypes = ["Chip", "Avatar", "IconButton"];
    const isInline = inlineTypes.includes(node.type);

    // Render component based on type
    let renderedComponent: React.ReactNode;

    switch (node.type) {
      case "Box":
        renderedComponent = renderBox(node, childrenElements, commonProps);
        break;
      case "Stack":
        renderedComponent = renderStack(node, childrenElements, commonProps);
        break;
      case "Grid":
        renderedComponent = renderGrid(node, childrenElements, commonProps);
        break;
      case "Divider":
        renderedComponent = renderDivider(node, commonProps);
        break;
      case "Paper":
        renderedComponent = renderPaper(node, childrenElements, commonProps);
        break;
      case "Container":
        renderedComponent = renderContainer(node, childrenElements, commonProps);
        break;
      case "Typography":
        renderedComponent = renderTypography(node, commonProps, isEditing && isSelected, onTextChange);
        break;
      case "Link":
        renderedComponent = renderLink(node, commonProps);
        break;
      case "TextField":
        renderedComponent = renderTextField(node, commonProps);
        break;
      case "Select":
        renderedComponent = renderSelect(node, commonProps);
        break;
      case "Checkbox":
        renderedComponent = renderCheckbox(node, commonProps);
        break;
      case "Radio":
        renderedComponent = renderRadio(node, commonProps);
        break;
      case "Switch":
        renderedComponent = renderSwitch(node, commonProps);
        break;
      case "Slider":
        renderedComponent = renderSlider(node, commonProps);
        break;
      case "Button":
        renderedComponent = renderButton(node, commonProps, isEditing && isSelected, onTextChange);
        break;
      case "IconButton":
        renderedComponent = renderIconButton(node, commonProps);
        break;
      case "ButtonGroup":
        renderedComponent = renderButtonGroup(node, childrenElements, commonProps);
        break;
      case "Chip":
        renderedComponent = renderChip(node, commonProps);
        break;
      case "Avatar":
        renderedComponent = renderAvatar(node, commonProps);
        break;
      case "Badge":
        renderedComponent = renderBadge(node, childrenElements, commonProps);
        break;
      case "Tooltip":
        renderedComponent = renderTooltip(node, childrenElements, commonProps);
        break;
      case "Alert":
        renderedComponent = renderAlert(node, commonProps);
        break;
      case "Tabs":
        renderedComponent = renderTabs(node, childrenElements, commonProps);
        break;
      case "Tab":
        renderedComponent = renderTab(node, commonProps);
        break;
      case "Breadcrumbs":
        renderedComponent = renderBreadcrumbs(node, commonProps);
        break;
      default:
        renderedComponent = <Box>Unknown component: {node.type}</Box>;
    }

    return (
      <NodeWrapper
        nodeId={node.id}
        nodeType={node.type}
        isSelected={isSelected}
        isHovered={isHovered}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        showOverlay={showOverlay}
        inline={isInline}
      >
        {renderedComponent}
      </NodeWrapper>
    );
  }
);

ComponentRenderer.displayName = "ComponentRenderer";

export default ComponentRenderer;
