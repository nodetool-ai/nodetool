/** @jsxImportSource @emotion/react */
/**
 * AutomationMenuButton — the pop-up buttons of the automation header row: a
 * compact button that shows the current choice and opens a menu of entries,
 * grouped when they carry a group. It draws on a fill (the mode select) or in
 * a text color (the parameter select).
 */

import React, { memo, useCallback, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";

import {
  BORDER_RADIUS,
  CONTROL,
  ContextMenu,
  FONT_SIZE_SANS,
  FONT_WEIGHT,
  MenuItemPrimitive,
  SPACING,
  getSpacingPx
} from "../../../ui_primitives";

export interface AutomationMenuEntry {
  key: string;
  label: string;
  /** Entries with the same group sit under one heading. */
  group?: string;
  /** Marks an entry that has content, such as a lane with points. */
  dot?: boolean;
  disabled?: boolean;
}

export type AutomationMenuTone =
  /** Neutral fill, disabled text. */
  | { kind: "neutral" }
  /** Filled with a theme role. */
  | { kind: "fill"; role: "success" | "warning" | "secondary" | "error" }
  /** Plain button, the label in this CSS color. */
  | { kind: "text"; color: string }
  /** Neutral button, a small dot in this CSS color before the label. */
  | { kind: "indicator"; color: string }
  /** An icon button; the label is its tooltip and accessible name. */
  | { kind: "icon"; icon: React.ReactNode };

interface Props {
  /** The text on the button. */
  label: string;
  /** The key of the current entry. */
  value: string;
  entries: readonly AutomationMenuEntry[];
  onSelect: (key: string) => void;
  tone: AutomationMenuTone;
  ariaLabel: string;
  testId: string;
  disabled?: boolean;
  /** A dot before the label, as on an entry with content. */
  dot?: boolean;
  /** Grow to fill the row. */
  grow?: boolean;
}

const DOT_PX = 6;

const buttonStyles = (theme: Theme, tone: AutomationMenuTone, grow: boolean) => {
  const p = theme.vars.palette;
  const fill =
    tone.kind === "fill"
      ? { background: p[tone.role].main, color: p[tone.role].contrastText }
      : tone.kind === "neutral"
        ? { background: p.action.disabledBackground, color: p.text.disabled }
        : tone.kind === "text"
          ? { background: p.action.hover, color: tone.color }
          : tone.kind === "indicator"
            ? { background: p.action.hover, color: p.text.secondary }
            : { background: "transparent", color: p.text.secondary };
  const icon = tone.kind === "icon";
  return css({
    display: "flex",
    alignItems: "center",
    gap: getSpacingPx(SPACING.xs),
    minWidth: 0,
    flex: grow ? 1 : "0 0 auto",
    height: CONTROL.height.xs,
    width: icon ? CONTROL.height.xs : undefined,
    justifyContent: icon ? "center" : undefined,
    padding: icon ? 0 : `0 ${getSpacingPx(SPACING.xs)} 0 ${getSpacingPx(SPACING.sm)}`,
    border: "none",
    borderRadius: BORDER_RADIUS.sm,
    cursor: "pointer",
    fontSize: FONT_SIZE_SANS.caption,
    fontWeight: FONT_WEIGHT.medium,
    ...fill,
    "&:hover:not(:disabled)": { background: p.action.focus },
    "&:disabled": { cursor: "default", opacity: 0.6 },
    "& .label": { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" },
    "& svg": { flexShrink: 0, fontSize: icon ? "1.4em" : "1em" }
  });
};

const dotStyles = (theme: Theme, visible: boolean, color?: string) =>
  css({
    display: "inline-block",
    flexShrink: 0,
    width: DOT_PX,
    height: DOT_PX,
    borderRadius: BORDER_RADIUS.circle,
    background: visible ? (color ?? theme.vars.palette.text.secondary) : "transparent"
  });

export const AutomationMenuButton: React.FC<Props> = memo(
  ({ label, value, entries, onSelect, tone, ariaLabel, testId, disabled, dot, grow = false }) => {
    const theme = useTheme();
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

    const open = useCallback(() => {
      const rect = buttonRef.current?.getBoundingClientRect();
      setPosition({ x: rect?.left ?? 0, y: rect?.bottom ?? 0 });
    }, []);
    const close = useCallback(() => setPosition(null), []);
    const anyDot = entries.some((entry) => entry.dot);

    return (
      <>
        <button
          ref={buttonRef}
          type="button"
          css={buttonStyles(theme, tone, grow)}
          disabled={disabled}
          onClick={open}
          aria-label={ariaLabel}
          title={tone.kind === "icon" ? label : undefined}
          aria-haspopup="menu"
          aria-expanded={position !== null}
          data-testid={testId}
        >
          {tone.kind === "icon" ? (
            tone.icon
          ) : (
            <>
              {tone.kind === "indicator" ? (
                <span css={dotStyles(theme, true, tone.color)} aria-hidden="true" />
              ) : (
                dot && (
                  <span
                    css={dotStyles(theme, true, tone.kind === "text" ? tone.color : undefined)}
                    aria-hidden="true"
                  />
                )
              )}
              <span className="label">{label}</span>
              <UnfoldMoreIcon />
            </>
          )}
        </button>
        <ContextMenu open={position !== null} position={position} onClose={close} maxHeight="60vh">
          {entries.flatMap((entry, index) => {
            const previous = entries[index - 1];
            const heading = entry.group !== undefined && entry.group !== previous?.group;
            const item = (
              <MenuItemPrimitive
                key={entry.key}
                label={entry.label}
                icon={anyDot ? <span css={dotStyles(theme, entry.dot === true)} aria-hidden="true" /> : undefined}
                checkable="radio"
                checked={entry.key === value}
                disabled={entry.disabled}
                onClick={() => {
                  close();
                  onSelect(entry.key);
                }}
              />
            );
            return heading
              ? [
                  <MenuItemPrimitive
                    key={`group:${entry.group}`}
                    label={entry.group as string}
                    disabled
                    dividerBefore={index > 0}
                  />,
                  item
                ]
              : [item];
          })}
        </ContextMenu>
      </>
    );
  }
);

AutomationMenuButton.displayName = "AutomationMenuButton";
