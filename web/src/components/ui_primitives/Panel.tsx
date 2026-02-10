/**
 * Panel Component
 * 
 * A panel component for grouping related content with optional header and footer.
 * Useful for creating sections within a page or dialog.
 */

import React from "react";
import { Box, BoxProps, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";

export interface PanelProps extends BoxProps {
  /** Panel title */
  title?: string;
  /** Panel subtitle or description */
  subtitle?: string;
  /** Header action element (e.g., button, icon) */
  headerAction?: React.ReactNode;
  /** Footer content */
  footer?: React.ReactNode;
  /** Padding size variant */
  padding?: "none" | "compact" | "normal" | "comfortable" | "spacious" | number;
  /** Enable border */
  bordered?: boolean;
  /** Background color */
  background?: "default" | "paper" | "transparent";
  /** Collapsible panel */
  collapsible?: boolean;
  /** Collapsed state (requires collapsible=true) */
  collapsed?: boolean;
  /** Collapse toggle handler */
  onToggleCollapse?: () => void;
}

const PADDING_VARIANTS = {
  none: 0,
  compact: 1,
  normal: 2,
  comfortable: 2.5,
  spacious: 3
};

/**
 * Panel - A panel component for grouping content
 * 
 * @example
 * // Basic panel with title
 * <Panel title="Settings">
 *   <Typography>Panel content</Typography>
 * </Panel>
 * 
 * @example
 * // Panel with header action
 * <Panel 
 *   title="Users" 
 *   subtitle="Manage user accounts"
 *   headerAction={<Button>Add User</Button>}
 * >
 *   <UserList />
 * </Panel>
 * 
 * @example
 * // Bordered panel with footer
 * <Panel 
 *   title="Confirm Changes"
 *   bordered
 *   footer={<Button>Save</Button>}
 * >
 *   <Typography>Review your changes</Typography>
 * </Panel>
 * 
 * @example
 * // Collapsible panel
 * <Panel 
 *   title="Advanced Options"
 *   collapsible
 *   collapsed={isCollapsed}
 *   onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
 * >
 *   <AdvancedSettings />
 * </Panel>
 */
export const Panel: React.FC<PanelProps> = ({
  title,
  subtitle,
  headerAction,
  footer,
  padding = "normal",
  bordered = false,
  background = "default",
  collapsible = false,
  collapsed = false,
  onToggleCollapse,
  sx,
  children,
  ...props
}) => {
  const theme = useTheme();
  
  const paddingValue = typeof padding === "number" 
    ? padding 
    : PADDING_VARIANTS[padding];

  const getBackgroundColor = () => {
    if (background === "paper") {
      return theme.vars.palette.background.paper;
    }
    if (background === "transparent") {
      return "transparent";
    }
    return theme.vars.palette.background.default;
  };

  const hasHeader = title || subtitle || headerAction;

  return (
    <Box
      sx={{
        backgroundColor: getBackgroundColor(),
        border: bordered ? `1px solid ${theme.vars.palette.divider}` : undefined,
        borderRadius: theme.shape.borderRadius,
        overflow: "hidden",
        ...sx
      }}
      {...props}
    >
      {hasHeader && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: theme.spacing(paddingValue, paddingValue, paddingValue / 2, paddingValue),
            borderBottom: collapsed ? undefined : `1px solid ${theme.vars.palette.divider}`,
            cursor: collapsible ? "pointer" : undefined
          }}
          onClick={collapsible ? onToggleCollapse : undefined}
        >
          <Box sx={{ flex: 1 }}>
            {title && (
              <Typography
                variant="h6"
                sx={{
                  fontSize: theme.fontSizeBig,
                  fontWeight: 600,
                  fontFamily: theme.fontFamily1,
                  mb: subtitle ? 0.5 : 0
                }}
              >
                {title}
              </Typography>
            )}
            {subtitle && (
              <Typography
                variant="body2"
                sx={{
                  fontSize: theme.fontSizeSmall,
                  color: theme.vars.palette.text.secondary
                }}
              >
                {subtitle}
              </Typography>
            )}
          </Box>
          {headerAction && (
            <Box sx={{ ml: 2 }}>
              {headerAction}
            </Box>
          )}
          {collapsible && (
            <Box sx={{ ml: 1 }}>
              {collapsed ? "▼" : "▲"}
            </Box>
          )}
        </Box>
      )}

      {!collapsed && (
        <>
          <Box sx={{ padding: theme.spacing(paddingValue) }}>
            {children}
          </Box>
          
          {footer && (
            <Box
              sx={{
                padding: theme.spacing(paddingValue / 2, paddingValue, paddingValue, paddingValue),
                borderTop: `1px solid ${theme.vars.palette.divider}`
              }}
            >
              {footer}
            </Box>
          )}
        </>
      )}
    </Box>
  );
};
