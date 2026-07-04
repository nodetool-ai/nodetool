/**
 * Popover Component
 *
 * A semantic wrapper around MUI Popover with simplified positioning
 * and built-in paper styling defaults.
 */

import React, { memo } from "react";
import MuiPopover, {
  PopoverProps as MuiPopoverProps
} from "@mui/material/Popover";
import { useTheme } from "@mui/material/styles";
import { SxProps, Theme } from "@mui/material";

export type PopoverPlacement =
  | "bottom-left"
  | "bottom-right"
  | "bottom-center"
  | "top-left"
  | "top-right"
  | "top-center";

export interface PopoverProps extends MuiPopoverProps {
  /**
   * Simplified placement relative to anchor element. Ignored when explicit
   * `anchorOrigin` / `transformOrigin` are provided (those win), so this stays
   * a non-lossy superset of MUI Popover.
   */
  placement?: PopoverPlacement;
  /** Max width of the popover content */
  maxWidth?: number | string;
  /** Max height of the popover content */
  maxHeight?: number | string;
  /** Additional sx for the paper element */
  paperSx?: SxProps<Theme>;
}

const PLACEMENT_MAP: Record<
  PopoverPlacement,
  {
    anchorOrigin: MuiPopoverProps["anchorOrigin"];
    transformOrigin: MuiPopoverProps["transformOrigin"];
  }
> = {
  "bottom-left": {
    anchorOrigin: { vertical: "bottom", horizontal: "left" },
    transformOrigin: { vertical: "top", horizontal: "left" }
  },
  "bottom-right": {
    anchorOrigin: { vertical: "bottom", horizontal: "right" },
    transformOrigin: { vertical: "top", horizontal: "right" }
  },
  "bottom-center": {
    anchorOrigin: { vertical: "bottom", horizontal: "center" },
    transformOrigin: { vertical: "top", horizontal: "center" }
  },
  "top-left": {
    anchorOrigin: { vertical: "top", horizontal: "left" },
    transformOrigin: { vertical: "bottom", horizontal: "left" }
  },
  "top-right": {
    anchorOrigin: { vertical: "top", horizontal: "right" },
    transformOrigin: { vertical: "bottom", horizontal: "right" }
  },
  "top-center": {
    anchorOrigin: { vertical: "top", horizontal: "center" },
    transformOrigin: { vertical: "bottom", horizontal: "center" }
  }
};

/**
 * Popover - Simplified popover with semantic positioning
 *
 * @example
 * // Basic usage
 * <Popover open={open} anchorEl={anchorEl} onClose={handleClose}>
 *   <Box sx={{ p: 2 }}>Content here</Box>
 * </Popover>
 *
 * @example
 * // With placement and size constraints
 * <Popover
 *   open={open}
 *   anchorEl={anchorEl}
 *   onClose={handleClose}
 *   placement="bottom-right"
 *   maxWidth={320}
 *   maxHeight="70vh"
 * >
 *   <ThreadList />
 * </Popover>
 */
const PopoverInternal: React.FC<PopoverProps> = ({
  placement = "bottom-left",
  maxWidth,
  maxHeight,
  paperSx,
  slotProps,
  anchorOrigin,
  transformOrigin,
  children,
  ...props
}) => {
  const theme = useTheme();
  const placed = PLACEMENT_MAP[placement];

  // Compute border radius with type guard since borderRadius can be string | number
  const borderRadiusValue = typeof theme.shape.borderRadius === "number"
    ? theme.shape.borderRadius / 4
    : undefined;

  // Preserve any sx the caller passed on the paper slot instead of clobbering
  // it. Compose as an array (MUI flattens these) so the primitive's defaults
  // sit underneath both the caller's slot sx and the `paperSx` convenience prop.
  const paperSlot = slotProps?.paper;
  const callerPaperSx =
    paperSlot && typeof paperSlot === "object" && "sx" in paperSlot
      ? (paperSlot as { sx?: SxProps<Theme> }).sx
      : undefined;
  const asArray = (s: SxProps<Theme> | undefined) =>
    s === undefined ? [] : Array.isArray(s) ? s : [s];

  return (
    <MuiPopover
      // Explicit origins win; otherwise derive from `placement`. This keeps the
      // primitive a drop-in for raw MUI Popover usages that position manually.
      anchorOrigin={anchorOrigin ?? placed.anchorOrigin}
      transformOrigin={transformOrigin ?? placed.transformOrigin}
      slotProps={{
        ...slotProps,
        paper: {
          ...(typeof paperSlot === "object" ? paperSlot : {}),
          sx: [
            {
              borderRadius: borderRadiusValue,
              maxWidth,
              maxHeight,
              overflow: maxHeight ? "auto" : undefined
            },
            ...asArray(callerPaperSx),
            ...asArray(paperSx)
          ] as SxProps<Theme>
        }
      }}
      {...props}
    >
      {children}
    </MuiPopover>
  );
};

export const Popover = memo(PopoverInternal);
