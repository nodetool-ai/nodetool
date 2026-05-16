/**
 * Sketch mode-toggle primitives.
 *
 * Thin wrapper around the `ToggleGroup` / `ToggleOption` UI primitives that
 * applies the sketch tool-settings panel sizing (compact, small font). All
 * tool option panels use these so the mode pickers look identical across
 * brush / shape / select / gradient / segment / pen-pressure panels.
 *
 * Variants:
 *   - default  → text-label buttons (Round / Soft / Linear / Radial / ...)
 *   - "icon"   → icon-only buttons with tighter padding (select-tool modes)
 */

import React, { memo } from "react";
import {
  ToggleGroup,
  ToggleOption,
  type ToggleGroupProps,
  type ToggleOptionProps
} from "../../ui_primitives/ToggleGroup";
import { SKETCH_FONT, SKETCH_SPACING } from "../sketchStyles";
import type { SxProps, Theme } from "@mui/material/styles";

const TEXT_OPTION_SX: SxProps<Theme> = {
  fontSize: SKETCH_FONT.xs,
  py: SKETCH_SPACING.xs,
  px: SKETCH_SPACING.md,
  fontWeight: 500
};

const ICON_OPTION_SX: SxProps<Theme> = {
  fontSize: SKETCH_FONT.xs,
  py: 0.5,
  px: 0.5,
  minWidth: 30,
  "& .MuiSvgIcon-root": { fontSize: 18 }
};

export type SketchModeToggleProps = Omit<ToggleGroupProps, "size">;

const SketchModeToggleInternal: React.FC<SketchModeToggleProps> = ({
  exclusive = true,
  ...props
}) => <ToggleGroup size="small" exclusive={exclusive} {...props} />;

export const SketchModeToggle = memo(SketchModeToggleInternal);
SketchModeToggle.displayName = "SketchModeToggle";

export interface SketchModeOptionProps extends ToggleOptionProps {
  /** "text" (default) or "icon" — icon variant uses tighter padding. */
  variant?: "text" | "icon";
}

const SketchModeOptionInternal: React.FC<SketchModeOptionProps> = ({
  variant = "text",
  sx,
  ...props
}) => {
  const base = variant === "icon" ? ICON_OPTION_SX : TEXT_OPTION_SX;
  return <ToggleOption {...props} sx={sx ? [base, sx as never].flat() : base} />;
};

export const SketchModeOption = memo(SketchModeOptionInternal);
SketchModeOption.displayName = "SketchModeOption";
