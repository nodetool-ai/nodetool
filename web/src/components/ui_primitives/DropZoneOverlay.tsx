/**
 * DropZoneOverlay Component
 *
 * A full-container `inset: 0` overlay that centers a drag-and-drop prompt
 * (icon + message). Replaces the `position: absolute; inset: 0` + centered
 * Text recipe reused across asset, collection, and explorer upload targets.
 *
 * The overlay is passive by default (`pointer-events: none`) so it doesn't
 * swallow drop events from the parent container. Set `interactive` when the
 * overlay itself should receive pointer events.
 */

import React, { memo } from "react";
import { Box, BoxProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Text } from "./Text";

export interface DropZoneOverlayProps extends Omit<BoxProps, "children"> {
  /** Whether the overlay is visible */
  visible: boolean;
  /** Prompt message (default: "Drop files to upload") */
  message?: React.ReactNode;
  /** Optional icon shown before the message */
  icon?: React.ReactNode;
  /** Background tint color (default: transparent — outer container handles tinting) */
  tint?: string;
  /** Z-index (default: 1) */
  zIndex?: number;
  /** Allow pointer events (default: false) */
  interactive?: boolean;
  /** Override the default prompt — takes precedence over `icon` + `message` */
  children?: React.ReactNode;
}

/**
 * DropZoneOverlay - Drag-and-drop prompt overlay
 *
 * @example
 * <Box
 *   onDragOver={handleDragOver}
 *   onDrop={handleDrop}
 *   sx={{ position: "relative" }}
 * >
 *   <Content />
 *   <DropZoneOverlay
 *     visible={isDragOver}
 *     icon={<UploadFileIcon />}
 *     message="Drop files to upload"
 *   />
 * </Box>
 */
export const DropZoneOverlay: React.FC<DropZoneOverlayProps> = memo(
  function DropZoneOverlay({
    visible,
    message = "Drop files to upload",
    icon,
    tint = "transparent",
    zIndex = 1,
    interactive = false,
    sx,
    children,
    ...props
  }) {
    const theme = useTheme();

    if (!visible) {
      return null;
    }

    return (
      <Box
        aria-hidden={interactive ? undefined : "true"}
        sx={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: tint,
          pointerEvents: interactive ? "auto" : "none",
          zIndex,
          ...sx
        }}
        {...props}
      >
        {children ?? (
          <Text
            size="normal"
            weight={700}
            sx={{
              color: theme.vars.palette.primary.main,
              display: "inline-flex",
              alignItems: "center",
              gap: theme.spacing(1.5),
              textShadow: `0 0 10px rgba(${theme.vars.palette.primary.mainChannel} / 0.2)`
            }}
          >
            {icon}
            {message}
          </Text>
        )}
      </Box>
    );
  }
);

DropZoneOverlay.displayName = "DropZoneOverlay";
