/**
 * Panel Component
 * 
 * A panel component for grouping related content with optional header and footer.
 * Useful for creating sections within a page or dialog. The title row is a
 * `PanelHeader`, so a Panel's title matches every other panel title strip; a
 * collapsible Panel puts its expand/collapse button in the header's actions.
 */

import React, { useRef } from "react";
import { Box, BoxProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Caption } from "./Caption";
import { ExpandCollapseButton } from "./ExpandCollapseButton";
import { PanelHeader } from "./PanelHeader";
import { SPACING, snapSpacing } from "./spacing";
import { isNumber } from "../../utils/typePredicates";

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
  comfortable: 3,
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
 *   headerAction={<Button>Add user</Button>}
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
  bordered = true,
  background = "paper",
  collapsible = false,
  collapsed = false,
  onToggleCollapse,
  sx,
  children,
  ...props
}) => {
  const theme = useTheme();

  // Generate unique ID for accessibility using a ref to ensure stability
  const idRef = useRef<string | undefined>(undefined);
  if (!idRef.current) {
    idRef.current = `panel-content-${Math.random().toString(36).substr(2, 9)}`;
  }
  const contentId = idRef.current;

  const paddingValue = isNumber(padding)
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
        borderRadius: theme.rounded.md,
        overflow: "hidden",
        ...sx
      }}
      {...props}
    >
      {hasHeader && (
        <Box
          sx={{
            borderBottom: collapsed ? undefined : `1px solid ${theme.vars.palette.divider}`
          }}
        >
          <PanelHeader
            title={title}
            divider={false}
            component="h3"
            actions={
              headerAction || collapsible ? (
                <>
                  {headerAction}
                  {collapsible && (
                    <ExpandCollapseButton
                      expanded={!collapsed}
                      onClick={onToggleCollapse}
                      aria-expanded={!collapsed}
                      aria-controls={contentId}
                    />
                  )}
                </>
              ) : undefined
            }
          />
          {subtitle && (
            <Caption
              component="p"
              color="secondary"
              sx={{ margin: 0, px: SPACING.lg, pb: SPACING.md }}
            >
              {subtitle}
            </Caption>
          )}
        </Box>
      )}

      {!collapsed && (
        <>
          <Box
            id={contentId}
            role={collapsible ? "region" : undefined}
            sx={{ padding: theme.spacing(paddingValue) }}
          >
            {children}
          </Box>

          {footer && (
            <Box
              sx={{
                padding: theme.spacing(snapSpacing(paddingValue / 2), paddingValue, paddingValue, paddingValue),
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
