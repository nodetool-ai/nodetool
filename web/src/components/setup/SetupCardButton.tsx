/**
 * The card-shaped control behind every setup picker — option cards, preset
 * tiles, alternative entry paths.
 *
 * One implementation so the disabled contract is identical everywhere: a real
 * `<button>` carrying `aria-disabled` rather than `disabled`, because a
 * disabled button fires no pointer events and would swallow the very tooltip
 * that names why it is off. The reason reaches assistive tech through the
 * tooltip's `describeChild`, which leaves the card's own text as its name.
 */

import React, { memo, useCallback } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import {
  BORDER_RADIUS,
  Box,
  MOTION,
  PADDING,
  Tooltip,
  reducedMotion
} from "../ui_primitives";

export interface SetupCardFrameOptions {
  selected?: boolean;
  disabled?: boolean;
  /** Padding in theme units. Media-filled tiles pass `PADDING.none`. */
  padding?: number;
  /** False for a frame that is not itself clickable (it holds the control). */
  interactive?: boolean;
}

/**
 * The card frame, shared so a tile whose media carries its own controls can
 * wear the same box without nesting one button inside another.
 */
export const setupCardSx = (
  theme: Theme,
  {
    selected = false,
    disabled = false,
    padding = PADDING.comfortable,
    interactive = true
  }: SetupCardFrameOptions
) => ({
  appearance: "none",
  textAlign: "left" as const,
  width: "100%",
  padding,
  backgroundColor: theme.vars.palette.background.paper,
  border: `1px solid ${
    selected ? theme.vars.palette.primary.main : theme.vars.palette.divider
  }`,
  borderRadius: BORDER_RADIUS.md,
  color: theme.vars.palette.text.primary,
  font: "inherit",
  overflow: "hidden",
  opacity: disabled ? 0.5 : 1,
  cursor: interactive ? (disabled ? "not-allowed" : "pointer") : "default",
  transition: `${MOTION.border}, ${MOTION.background}`,
  ...reducedMotion({ transition: MOTION.none }),
  "&:hover":
    interactive && !disabled
      ? { backgroundColor: theme.vars.palette.action.hover }
      : undefined,
  "&:focus-visible": {
    outline: `2px solid ${theme.vars.palette.primary.main}`,
    outlineOffset: 2
  }
});

export interface SetupCardButtonProps extends SetupCardFrameOptions {
  /** Why the card is off. Shown as a tooltip and described to assistive tech. */
  disabledReason?: string;
  onSelect: () => void;
  children: React.ReactNode;
}

const SetupCardButtonInternal: React.FC<SetupCardButtonProps> = ({
  selected,
  disabled = false,
  disabledReason,
  padding,
  onSelect,
  children
}) => {
  const theme = useTheme();
  const handleClick = useCallback(() => {
    if (!disabled) {
      onSelect();
    }
  }, [disabled, onSelect]);

  const button = (
    <Box
      component="button"
      type="button"
      aria-disabled={disabled || undefined}
      aria-pressed={selected}
      onClick={handleClick}
      sx={setupCardSx(theme, { selected, disabled, padding })}
    >
      {children}
    </Box>
  );

  if (!disabled || !disabledReason) {
    return button;
  }
  return (
    <Tooltip title={disabledReason} describeChild>
      {button}
    </Tooltip>
  );
};

export const SetupCardButton = memo(SetupCardButtonInternal);
SetupCardButton.displayName = "SetupCardButton";
