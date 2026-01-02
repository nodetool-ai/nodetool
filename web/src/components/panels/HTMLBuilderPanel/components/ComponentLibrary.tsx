/**
 * ComponentLibrary Component
 *
 * Sidebar palette showing available HTML components organized by category.
 * Supports drag-and-drop to add components to the canvas.
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  TextField,
  InputAdornment,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Tooltip
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SearchIcon from "@mui/icons-material/Search";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import TitleIcon from "@mui/icons-material/Title";
import AssignmentIcon from "@mui/icons-material/Assignment";
import ImageIcon from "@mui/icons-material/Image";
import TouchAppIcon from "@mui/icons-material/TouchApp";

import {
  componentRegistry,
  getCategories,
  getComponentsByCategory
} from "../utils/componentRegistry";
import type { ComponentDefinition } from "../types/builder.types";

/**
 * Props for ComponentLibrary
 */
interface ComponentLibraryProps {
  /** Called when a component is selected (clicked or dropped) */
  onComponentSelect?: (component: ComponentDefinition) => void;
  /** Called when drag starts */
  onDragStart?: (component: ComponentDefinition) => void;
  /** Called when drag ends */
  onDragEnd?: () => void;
}

/**
 * Get icon component by name
 */
const getIconComponent = (iconName: string): React.ReactNode => {
  const iconMap: Record<string, React.ReactNode> = {
    ViewModule: <ViewModuleIcon />,
    Title: <TitleIcon />,
    Assignment: <AssignmentIcon />,
    Image: <ImageIcon />,
    TouchApp: <TouchAppIcon />
  };
  return iconMap[iconName] || <ViewModuleIcon />;
};

/**
 * Single component item in the library
 */
interface ComponentItemProps {
  component: ComponentDefinition;
  onSelect: (component: ComponentDefinition) => void;
  onDragStart: (component: ComponentDefinition) => void;
  onDragEnd: () => void;
}

const ComponentItem: React.FC<ComponentItemProps> = ({
  component,
  onSelect,
  onDragStart,
  onDragEnd
}) => {
  const theme = useTheme();

  const handleClick = useCallback(() => {
    onSelect(component);
  }, [component, onSelect]);

  const handleDragStart = useCallback(
    (event: React.DragEvent) => {
      event.dataTransfer.setData(
        "application/x-html-builder-component",
        JSON.stringify(component)
      );
      event.dataTransfer.effectAllowed = "copy";
      onDragStart(component);
    },
    [component, onDragStart]
  );

  const handleDragEnd = useCallback(() => {
    onDragEnd();
  }, [onDragEnd]);

  return (
    <Tooltip title={component.description} placement="right" arrow>
      <ListItem
        onClick={handleClick}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        sx={{
          cursor: "grab",
          borderRadius: 1,
          mb: 0.5,
          py: 1,
          px: 1.5,
          "&:hover": {
            backgroundColor: theme.palette.action.hover
          },
          "&:active": {
            cursor: "grabbing"
          }
        }}
      >
        <ListItemIcon sx={{ minWidth: 36, color: theme.palette.text.secondary }}>
          {getIconComponent(component.icon)}
        </ListItemIcon>
        <ListItemText
          primary={component.name}
          primaryTypographyProps={{
            variant: "body2",
            noWrap: true
          }}
        />
      </ListItem>
    </Tooltip>
  );
};

/**
 * ComponentLibrary component
 */
export const ComponentLibrary: React.FC<ComponentLibraryProps> = ({
  onComponentSelect,
  onDragStart,
  onDragEnd
}) => {
  const theme = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<string[]>([
    "layout",
    "typography"
  ]);

  const categories = useMemo(() => getCategories(), []);

  // Filter components by search query
  const filteredComponents = useMemo(() => {
    if (!searchQuery.trim()) {
      return componentRegistry;
    }

    const query = searchQuery.toLowerCase();
    return componentRegistry.filter(
      (component) =>
        component.name.toLowerCase().includes(query) ||
        component.description.toLowerCase().includes(query) ||
        component.tag.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  // Group filtered components by category
  const componentsByCategory = useMemo(() => {
    const grouped: Record<string, ComponentDefinition[]> = {};
    for (const category of categories) {
      const components = filteredComponents.filter(
        (c) => c.category === category.id
      );
      if (components.length > 0) {
        grouped[category.id] = components;
      }
    }
    return grouped;
  }, [filteredComponents, categories]);

  // Handle search input
  const handleSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(event.target.value);
    },
    []
  );

  // Handle category expansion
  const handleCategoryToggle = useCallback(
    (categoryId: string) => (_event: React.SyntheticEvent, isExpanded: boolean) => {
      setExpandedCategories((prev) =>
        isExpanded
          ? [...prev, categoryId]
          : prev.filter((id) => id !== categoryId)
      );
    },
    []
  );

  // Handle component selection
  const handleComponentSelect = useCallback(
    (component: ComponentDefinition) => {
      onComponentSelect?.(component);
    },
    [onComponentSelect]
  );

  // Handle drag start
  const handleDragStart = useCallback(
    (component: ComponentDefinition) => {
      onDragStart?.(component);
    },
    [onDragStart]
  );

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    onDragEnd?.();
  }, [onDragEnd]);

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
      }}
    >
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
          Components
        </Typography>
        <TextField
          fullWidth
          size="small"
          placeholder="Search components..."
          value={searchQuery}
          onChange={handleSearchChange}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="action" />
              </InputAdornment>
            )
          }}
        />
      </Box>

      {/* Component list */}
      <Box sx={{ flex: 1, overflow: "auto", px: 1, py: 1 }}>
        {Object.keys(componentsByCategory).length === 0 ? (
          <Box sx={{ p: 2, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              No components found
            </Typography>
          </Box>
        ) : (
          categories.map((category) => {
            const components = componentsByCategory[category.id];
            if (!components || components.length === 0) {
              return null;
            }

            return (
              <Accordion
                key={category.id}
                expanded={expandedCategories.includes(category.id)}
                onChange={handleCategoryToggle(category.id)}
                disableGutters
                elevation={0}
                sx={{
                  backgroundColor: "transparent",
                  "&:before": { display: "none" },
                  "&.Mui-expanded": { margin: 0 }
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  sx={{
                    minHeight: 40,
                    px: 1,
                    "&.Mui-expanded": { minHeight: 40 }
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    {getIconComponent(category.icon)}
                    <Typography variant="body2" fontWeight="medium">
                      {category.name}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ ml: "auto" }}
                    >
                      ({components.length})
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ p: 0 }}>
                  <List dense disablePadding>
                    {components.map((component) => (
                      <ComponentItem
                        key={component.id}
                        component={component}
                        onSelect={handleComponentSelect}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                      />
                    ))}
                  </List>
                </AccordionDetails>
              </Accordion>
            );
          })
        )}
      </Box>
    </Box>
  );
};

export default ComponentLibrary;
