/**
 * Component Palette
 *
 * A panel showing available components organized by category.
 * Components can be dragged onto the canvas or clicked to add to selected parent.
 */

import React, { useCallback } from "react";
import { Box, Typography, Tooltip, Collapse, IconButton } from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  // Layout icons
  Square as BoxIcon,
  ViewStream as StackIcon,
  GridView as GridIcon,
  HorizontalRule as DividerIcon,
  Article as PaperIcon,
  WebAsset as ContainerIcon,
  // Typography icons
  TextFields as TypographyIcon,
  Link as LinkIcon,
  // Input icons
  TextSnippet as TextFieldIcon,
  ArrowDropDownCircle as SelectIcon,
  CheckBox as CheckboxIcon,
  RadioButtonChecked as RadioIcon,
  ToggleOn as SwitchIcon,
  LinearScale as SliderIcon,
  // Action icons
  SmartButton as ButtonIcon,
  TouchApp as IconButtonIcon,
  ViewWeek as ButtonGroupIcon,
  // Data Display icons
  Label as ChipIcon,
  AccountCircle as AvatarIcon,
  NotificationsActive as BadgeIcon,
  Info as TooltipIcon,
  Warning as AlertIcon,
  // Navigation icons
  Tab as TabsIcon,
  NavigateNext as BreadcrumbsIcon,
  DragIndicator as DragIcon,
} from "@mui/icons-material";
import type { MuiComponentType } from "../types";
import { componentRegistry } from "../types/registry";
import { useWysiwygEditorStore } from "../hooks/useWysiwygEditorStore";

/**
 * Icon map for component types
 */
const componentIcons: Record<MuiComponentType, React.ElementType> = {
  Box: BoxIcon,
  Stack: StackIcon,
  Grid: GridIcon,
  Divider: DividerIcon,
  Paper: PaperIcon,
  Container: ContainerIcon,
  Typography: TypographyIcon,
  Link: LinkIcon,
  TextField: TextFieldIcon,
  Select: SelectIcon,
  Checkbox: CheckboxIcon,
  Radio: RadioIcon,
  Switch: SwitchIcon,
  Slider: SliderIcon,
  Button: ButtonIcon,
  IconButton: IconButtonIcon,
  ButtonGroup: ButtonGroupIcon,
  Chip: ChipIcon,
  Avatar: AvatarIcon,
  Badge: BadgeIcon,
  Tooltip: TooltipIcon,
  Alert: AlertIcon,
  Tabs: TabsIcon,
  Tab: TabsIcon,
  Breadcrumbs: BreadcrumbsIcon,
};

/**
 * Category configuration
 */
const categories = [
  { key: "layout", label: "Layout", color: "#60A5FA" },
  { key: "typography", label: "Typography", color: "#A78BFA" },
  { key: "inputs", label: "Inputs", color: "#50FA7B" },
  { key: "actions", label: "Actions", color: "#FFB86C" },
  { key: "dataDisplay", label: "Data Display", color: "#FF79C6" },
  { key: "navigation", label: "Navigation", color: "#8BE9FD" },
] as const;

/**
 * Single draggable component button
 */
interface ComponentButtonProps {
  type: MuiComponentType;
  onAdd: (type: MuiComponentType) => void;
  onDragStart: (type: MuiComponentType, e: React.DragEvent) => void;
  color: string;
}

const ComponentButton: React.FC<ComponentButtonProps> = ({ type, onAdd, onDragStart, color }) => {
  const definition = componentRegistry[type];
  const IconComponent = componentIcons[type] || BoxIcon;

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/wysiwyg-component", type);
    e.dataTransfer.effectAllowed = "copy";
    onDragStart(type, e);
  };

  return (
    <Tooltip title={definition.description} placement="top" arrow>
      <Box
        draggable
        onDragStart={handleDragStart}
        onClick={() => onAdd(type)}
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 0.5,
          p: 1,
          minWidth: 64,
          borderRadius: 1,
          cursor: "grab",
          bgcolor: "rgba(255, 255, 255, 0.02)",
          border: "1px solid",
          borderColor: "divider",
          transition: "all 0.15s ease",
          "&:hover": {
            bgcolor: "rgba(255, 255, 255, 0.06)",
            borderColor: color,
            "& .component-icon": {
              color: color,
            },
          },
          "&:active": {
            cursor: "grabbing",
          },
        }}
      >
        <IconComponent
          className="component-icon"
          sx={{
            fontSize: 20,
            color: "text.secondary",
            transition: "color 0.15s ease",
          }}
        />
        <Typography
          variant="caption"
          sx={{
            fontSize: "0.65rem",
            color: "text.secondary",
            textAlign: "center",
            lineHeight: 1.2,
          }}
        >
          {definition.label}
        </Typography>
        <DragIcon
          sx={{
            fontSize: 10,
            color: "text.disabled",
            opacity: 0.5,
          }}
        />
      </Box>
    </Tooltip>
  );
};

/**
 * Component Palette Panel
 */
export const ComponentPalette: React.FC = () => {
  const { schema, selectedNodeId, addNode, setDragging } = useWysiwygEditorStore();
  const [expandedCategories, setExpandedCategories] = React.useState<Set<string>>(
    new Set(categories.map((c) => c.key))
  );

  // Get parent for adding new components
  const parentId = selectedNodeId || schema.root.id;

  // Get parent definition to filter allowed children
  const parentNode = useWysiwygEditorStore.getState().getNode(parentId);
  const parentDef = parentNode ? componentRegistry[parentNode.type] : null;

  const isAllowed = useCallback(
    (type: MuiComponentType) => {
      if (!parentDef) {
        return true;
      }
      if (parentDef.childPolicy === "any") {
        return true;
      }
      if (parentDef.childPolicy === "none") {
        return false;
      }
      if (parentDef.childPolicy === "specific" && parentDef.allowedChildren) {
        return parentDef.allowedChildren.includes(type);
      }
      return true;
    },
    [parentDef]
  );

  const handleToggleCategory = (key: string) => {
    setExpandedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const handleAddComponent = useCallback(
    (type: MuiComponentType) => {
      addNode(parentId, type);
    },
    [addNode, parentId]
  );

  const handleDragStart = useCallback(
    (_type: MuiComponentType, _e: React.DragEvent) => {
      setDragging(true);
    },
    [setDragging]
  );

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderTop: 1,
        borderColor: "divider",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 1,
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
            color: "text.secondary",
            letterSpacing: "0.05em",
          }}
        >
          Add Components
        </Typography>
      </Box>

      {/* Categories */}
      <Box sx={{ flex: 1, overflow: "auto", p: 1 }}>
        {categories.map(({ key, label, color }) => {
          const components = Object.values(componentRegistry).filter(
            (c) => c.category === key && isAllowed(c.type)
          );
          if (components.length === 0) {
            return null;
          }

          const isExpanded = expandedCategories.has(key);

          return (
            <Box key={key} sx={{ mb: 1 }}>
              {/* Category header */}
              <Box
                onClick={() => handleToggleCategory(key)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  cursor: "pointer",
                  py: 0.5,
                  px: 0.5,
                  borderRadius: 1,
                  "&:hover": {
                    bgcolor: "action.hover",
                  },
                }}
              >
                <IconButton size="small" sx={{ p: 0, mr: 0.5 }}>
                  {isExpanded ? (
                    <ExpandMoreIcon sx={{ fontSize: 16 }} />
                  ) : (
                    <ChevronRightIcon sx={{ fontSize: 16 }} />
                  )}
                </IconButton>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    bgcolor: color,
                    mr: 1,
                  }}
                />
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 600,
                    color: "text.primary",
                    textTransform: "uppercase",
                    fontSize: "0.65rem",
                    letterSpacing: "0.05em",
                  }}
                >
                  {label}
                </Typography>
              </Box>

              {/* Components grid */}
              <Collapse in={isExpanded}>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 0.5,
                    mt: 0.5,
                    ml: 2,
                  }}
                >
                  {components.map((comp) => (
                    <ComponentButton
                      key={comp.type}
                      type={comp.type}
                      onAdd={handleAddComponent}
                      onDragStart={handleDragStart}
                      color={color}
                    />
                  ))}
                </Box>
              </Collapse>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default ComponentPalette;
