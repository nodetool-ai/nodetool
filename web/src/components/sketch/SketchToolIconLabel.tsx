/**
 * Icon with label and optional shortcut chip
 */

/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import type { SxProps, Theme } from "@mui/material/styles";
import { alpha, useTheme } from "@mui/material/styles";
import { FlexRow, Text, Box } from "../ui_primitives";
import { SKETCH_FONT } from "./sketchStyles";

export interface SketchToolIconLabelProps {
  /** Rendered icon (e.g. Mui SvgIcon with sx fontSize). */
  icon: React.ReactNode;
  /** Tool name; displayed uppercase. */
  label: string;
  /** `column`: well full width, label below. `row`: fixed well, label to the right (e.g. header). */
  direction: "column" | "row";
  /** Smaller wells and type (tool grid tiles). */
  compact?: boolean;
  /** Corner chip; hidden until tile hover/focus or `selected` (see ToolGridButton). */
  shortcut?: string;
  /** Highlight well border (selected tool tile). */
  selected?: boolean;
  className?: string;
  sx?: SxProps<Theme>;
}

function SketchToolIconLabel({
  icon,
  label,
  direction,
  compact = false,
  shortcut,
  selected = false,
  className,
  sx: sxProp
}: SketchToolIconLabelProps) {
  const theme = useTheme();
  const shortcutBg = theme.vars.palette.grey[900];
  const row = direction === "row";
  const shortcutChip = shortcut ? (
    <Box
      component="span"
      className="sketch-tool-icon-label__shortcut"
      sx={{
        position: "absolute",
        top: compact ? 2 : 4,
        right: compact ? 2 : 4,
        zIndex: 1,
        px: compact ? 0.35 : 0.5,
        py: compact ? 0.12 : 0.1,
        borderRadius: 1,
        backgroundColor: shortcutBg,
        fontSize: compact ? SKETCH_FONT.xs : SKETCH_FONT.sm,
        fontWeight: 700,
        lineHeight: 1.2,
        color: "text.secondary",
        opacity: selected ? 1 : 0,
        pointerEvents: "none",
        transition: "opacity 120ms ease"
      }}
    >
      {shortcut}
    </Box>
  ) : null;

  const iconWell = (
    <FlexRow
      className="sketch-tool-icon-label__well"
      align="center"
      justify="center"
      sx={{
        flex: row ? "0 0 auto" : undefined,
        width: row ? 34 : "100%",
        height: row ? 34 : undefined,
        minHeight: row ? undefined : compact ? 30 : 38,
        borderRadius: "2px",
        backgroundColor: alpha(theme.palette.common.black, 0.22),
        boxSizing: "border-box",
        color: "primary.light",
        lineHeight: 0
      }}
    >
      {icon}
    </FlexRow>
  );

  return (
    <Box
      className={
        ["sketch-tool-icon-label", className].filter(Boolean).join(" ") || undefined
      }
      sx={[
        {
          position: "relative",
          display: "flex",
          flexDirection: row ? "row" : "column",
          alignItems: row ? "center" : "stretch",
          gap: row ? 1 : compact ? 0.65 : 0.85,
          width: "100%",
          minWidth: 0
        },
        ...(sxProp ? (Array.isArray(sxProp) ? sxProp : [sxProp]) : [])
      ]}
    >
      {shortcutChip}
      {iconWell}
      <Text
        component="span"
        className="sketch-tool-icon-label__label"
        sx={{
          fontSize: compact ? SKETCH_FONT.xxs : SKETCH_FONT.sm,
          fontWeight: row ? 700 : 600,
          color: row ? "text.primary" : "text.secondary",
          lineHeight: 1.15,
          textTransform: "uppercase",
          letterSpacing: row ? "0.08em" : "0.07em",
          textAlign: row ? "left" : "center",
          width: row ? undefined : "100%",
          minWidth: 0,
          flex: row ? "1 1 auto" : undefined,
          ...(compact && !row
            ? {
                display: "-webkit-box",
                WebkitBoxOrient: "vertical" as const,
                WebkitLineClamp: 2,
                overflow: "hidden",
                wordBreak: "break-word" as const,
                px: 0.15
              }
            : {})
        }}
      >
        {label}
      </Text>
    </Box>
  );
}

export default memo(SketchToolIconLabel);
