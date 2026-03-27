/**
 * DrawerPanel Component
 *
 * A slide-out panel wrapping MUI Drawer with consistent
 * sizing, styling, and header patterns.
 */

import React, { memo } from "react";
import { Drawer, DrawerProps, Box, IconButton, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";

export interface DrawerPanelProps
  extends Omit<DrawerProps, "anchor" | "variant"> {
  /** Which edge the drawer slides from */
  anchor?: "left" | "right" | "top" | "bottom";
  /** Drawer variant */
  variant?: "temporary" | "persistent" | "permanent";
  /** Optional title shown in a header bar */
  title?: string;
  /** Width for left/right drawers (number = px, string = CSS value) */
  width?: number | string;
  /** Height for top/bottom drawers */
  height?: number | string;
  /** Show a close button in the header */
  showClose?: boolean;
}

/**
 * DrawerPanel - Slide-out panel with optional header
 *
 * @example
 * // Basic right drawer
 * <DrawerPanel open={isOpen} onClose={handleClose} title="Settings">
 *   <SettingsForm />
 * </DrawerPanel>
 *
 * @example
 * // Bottom drawer with custom height
 * <DrawerPanel
 *   open={showLogs}
 *   onClose={closeLogs}
 *   anchor="bottom"
 *   height="40vh"
 *   title="Logs"
 * >
 *   <LogsTable />
 * </DrawerPanel>
 *
 * @example
 * // Wide left drawer without header
 * <DrawerPanel open={showNav} onClose={closeNav} anchor="left" width={400}>
 *   <Navigation />
 * </DrawerPanel>
 */
const DrawerPanelInternal: React.FC<DrawerPanelProps> = ({
  anchor = "right",
  variant = "temporary",
  title,
  width = 320,
  height = "auto",
  showClose = true,
  onClose,
  sx,
  children,
  ...props
}) => {
  const theme = useTheme();
  const isHorizontal = anchor === "left" || anchor === "right";

  return (
    <Drawer
      anchor={anchor}
      variant={variant}
      onClose={onClose}
      sx={{
        "& .MuiDrawer-paper": {
          width: isHorizontal ? width : "100%",
          height: !isHorizontal ? height : "100%",
          backgroundColor: theme.vars.palette.background.default
        },
        ...sx
      }}
      {...props}
    >
      {title && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: theme.spacing(1.5, 2),
            borderBottom: `1px solid ${theme.vars.palette.divider}`
          }}
        >
          <Typography variant="subtitle1" fontWeight={600}>
            {title}
          </Typography>
          {showClose && onClose && (
            <IconButton
              onClick={onClose as React.MouseEventHandler}
              size="small"
              aria-label="Close drawer"
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      )}
      <Box sx={{ flex: 1, overflow: "auto" }}>{children}</Box>
    </Drawer>
  );
};

export const DrawerPanel = memo(DrawerPanelInternal);
