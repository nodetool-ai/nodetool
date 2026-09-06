/**
 * The card-shaped control behind every setup picker — option cards, preset
 * tiles, alternative entry paths.
 *
 * One implementation so the disabled contract is identical everywhere: a real
 * `<button>` carrying `aria-disabled` rather than `disabled`, because a
 * disabled button fires no pointer events and would swallow the very tooltip
 * that names why it is off. The reason reaches assistive tech through the
 * tooltip's `describeChild`, which leaves the card's own text as its name.
 *
 * A card says which kind of decision it is through {@link SetupCardRole}. A
 * mutually exclusive choice is a radio, not a pressed toggle, and its grid
 * owns the focus order through {@link useRovingRadioGroup}: one tab stop for
 * the whole set, arrow keys between the options.
 */

import React, { memo, useCallback, useRef } from "react";
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
 * What the card decides.
 *
 * - `radio` — one of a mutually exclusive set. Announced as a radio, and the
 *   grid gives the set a single tab stop.
 * - `toggle` — an independent on/off card. Announced with `aria-pressed`.
 * - `navigation` — a card that opens something rather than picking it. No
 *   selection state at all, so a screen reader does not offer one.
 */
export type SetupCardRole = "radio" | "toggle" | "navigation";

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
  // A picked card has to read as picked across a grid of twelve identical
  // neighbours, where a 1px border change is invisible: the ring doubles the
  // edge and the tint lifts the whole card off the grid.
  backgroundColor: selected
    ? theme.vars.palette.action.selected
    : theme.vars.palette.background.paper,
  border: `1px solid ${
    selected ? theme.vars.palette.primary.main : theme.vars.palette.divider
  }`,
  boxShadow: selected
    ? `0 0 0 1px ${theme.vars.palette.primary.main}`
    : "none",
  borderRadius: BORDER_RADIUS.md,
  color: theme.vars.palette.text.primary,
  font: "inherit",
  overflow: "hidden",
  opacity: disabled ? 0.5 : 1,
  cursor: interactive ? (disabled ? "not-allowed" : "pointer") : "default",
  transition: `${MOTION.border}, ${MOTION.background}`,
  ...reducedMotion({ transition: MOTION.none }),
  "&:hover":
    interactive && !disabled && !selected
      ? { backgroundColor: theme.vars.palette.action.hover }
      : undefined,
  "&:focus-visible": {
    outline: `2px solid ${theme.vars.palette.primary.main}`,
    outlineOffset: 2
  }
});

/**
 * The ARIA attributes a card carries for its role. Split out because a framed
 * tile draws its own select control rather than using `SetupCardButton`, and
 * the two must announce a choice the same way.
 */
export const setupCardRoleProps = (
  role: SetupCardRole,
  selected: boolean | undefined
): { role?: "radio"; "aria-checked"?: boolean; "aria-pressed"?: boolean } => {
  if (role === "radio") {
    return { role: "radio", "aria-checked": selected === true };
  }
  if (role === "toggle") {
    return { "aria-pressed": selected };
  }
  return {};
};

export interface SetupCardButtonProps extends SetupCardFrameOptions {
  /** Why the card is off. Shown as a tooltip and described to assistive tech. */
  disabledReason?: string;
  onSelect: () => void;
  children: React.ReactNode;
  /** What the card decides. Defaults to `toggle`. */
  role?: SetupCardRole;
  /** Roving focus order, supplied by {@link useRovingRadioGroup}. */
  tabIndex?: number;
  onKeyDown?: React.KeyboardEventHandler<HTMLButtonElement>;
  ref?: React.Ref<HTMLButtonElement>;
}

const SetupCardButtonInternal: React.FC<SetupCardButtonProps> = ({
  selected,
  disabled = false,
  disabledReason,
  padding,
  onSelect,
  children,
  role = "toggle",
  tabIndex,
  onKeyDown,
  ref
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
      ref={ref}
      aria-disabled={disabled || undefined}
      {...setupCardRoleProps(role, selected)}
      tabIndex={tabIndex}
      onKeyDown={onKeyDown}
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

/** One member of a radio group: its id, and whether it can be picked. */
export interface RovingRadioItem {
  id: string;
  disabled?: boolean;
}

/** What a grid spreads onto each of its cards. */
export interface RovingRadioItemProps {
  role: SetupCardRole;
  selected: boolean;
  tabIndex: number;
  onKeyDown: React.KeyboardEventHandler<HTMLButtonElement>;
  ref: (node: HTMLElement | null) => void;
}

/**
 * Roving focus for a mutually exclusive set of cards (WAI-ARIA radio group):
 * the whole set is one tab stop, and the arrow keys move between the options,
 * picking as they go. A disabled card is skipped rather than landed on.
 *
 * The checked card is the tab stop. With nothing checked, the first selectable
 * card is, so Tab always reaches the group.
 */
export const useRovingRadioGroup = (
  items: readonly RovingRadioItem[],
  selectedId: string | null | undefined,
  onSelect: (id: string) => void
): ((item: RovingRadioItem) => RovingRadioItemProps) => {
  const nodes = useRef(new Map<string, HTMLElement>());
  const register = useCallback(
    (id: string) => (node: HTMLElement | null) => {
      if (node === null) {
        nodes.current.delete(id);
      } else {
        nodes.current.set(id, node);
      }
    },
    []
  );

  const selectable = items.filter((item) => item.disabled !== true);
  const tabStopId =
    selectable.find((item) => item.id === selectedId)?.id ??
    selectable[0]?.id ??
    items[0]?.id;

  const handleKeyDown =
    (id: string): React.KeyboardEventHandler<HTMLButtonElement> =>
    (event) => {
      const index = selectable.findIndex((item) => item.id === id);
      if (index < 0 || selectable.length === 0) {
        return;
      }
      const last = selectable.length - 1;
      let next: RovingRadioItem | undefined;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        next = selectable[index === last ? 0 : index + 1];
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        next = selectable[index === 0 ? last : index - 1];
      } else if (event.key === "Home") {
        next = selectable[0];
      } else if (event.key === "End") {
        next = selectable[last];
      }
      if (next === undefined) {
        return;
      }
      event.preventDefault();
      nodes.current.get(next.id)?.focus();
      onSelect(next.id);
    };

  return (item) => ({
    role: "radio",
    selected: item.id === selectedId,
    tabIndex: item.id === tabStopId ? 0 : -1,
    onKeyDown: handleKeyDown(item.id),
    ref: register(item.id)
  });
};

/**
 * The focus state a group of cards is in. `single-select` is the mutually
 * exclusive grid; `navigation` is a row of cards that each open something.
 */
export type SetupCardGridMode = "single-select" | "navigation";
