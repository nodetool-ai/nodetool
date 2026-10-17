/** @jsxImportSource @emotion/react */
/**
 * One device in the DAW device chain: a title bar (reorder grip, enable
 * switch, collapse, remove) over the device's own surface. Collapsed, the card
 * narrows to a strip with the title running vertically, the way a DAW folds a
 * device it is not editing.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";

import {
  BORDER_RADIUS,
  MOTION,
  SPACING,
  ToolbarIconButton,
  Tooltip,
  TruncatedText,
  TYPOGRAPHY
} from "../../../ui_primitives";

/** Drag payload of a device being reordered: its index in the chain. */
export const DEVICE_DRAG_MIME = "application/x-nodetool-device-index";

export interface DeviceCardProps {
  title: string;
  /** Short kind label under the title, e.g. "Instrument" or "Audio effect". */
  kind?: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Omit for a device that cannot be switched off (the instrument). */
  enabled?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
  onRemove?: () => void;
  /** Position among the reorderable devices; omit for a fixed device. */
  index?: number;
  onMove?: (from: number, to: number) => void;
  /** Width of the expanded card: px, or any CSS width. */
  width?: number | string;
  /**
   * `row` (the default) sits in a horizontal rack at the rack's height and
   * scrolls its body. `stack` fills the width of a vertical rack at the
   * device's natural height, and folds to its header when collapsed.
   */
  layout?: "row" | "stack";
  testId?: string;
  children: React.ReactNode;
}

const cardStyles = (
  theme: Theme,
  width: number | string,
  collapsed: boolean,
  dragOver: "left" | "right" | null,
  dragging: boolean,
  disabled: boolean,
  stacked: boolean
) => {
  const vertical = collapsed && !stacked;
  return css({
    position: "relative",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    height: stacked ? "auto" : "100%",
    minHeight: 0,
    boxSizing: "border-box",
    width: stacked ? "100%" : vertical ? theme.spacing(SPACING.xxxl + SPACING.md) : width,
    minWidth: stacked || vertical ? undefined : theme.spacing(SPACING.xxxl * 5),
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: theme.vars.palette.background.paper,
    opacity: dragging ? 0.4 : 1,
    transition: `${MOTION.opacity}, ${MOTION.border}`,
    ".device-card__header": {
      display: "flex",
      flexDirection: vertical ? "column" : "row",
      alignItems: "center",
      gap: theme.spacing(SPACING.micro),
      padding: theme.spacing(SPACING.micro, SPACING.xs),
      borderBottom: collapsed ? "none" : `1px solid ${theme.vars.palette.divider}`,
      flexShrink: 0,
      minWidth: 0,
      height: vertical ? "100%" : undefined
    },
    ".device-card__label": {
      display: "flex",
      alignItems: "baseline",
      gap: theme.spacing(SPACING.sm),
      minWidth: 0,
      flex: "0 1 auto",
      paddingLeft: theme.spacing(SPACING.micro)
    },
    ".device-card__spacer": { flex: "1 1 auto" },
    ".device-card__title": {
      ...TYPOGRAPHY.sans.label,
      color: disabled ? theme.vars.palette.text.disabled : theme.vars.palette.text.primary,
      minWidth: 0,
      flex: "0 1 auto"
    },
    ".device-card__vertical-title": {
      ...TYPOGRAPHY.sans.label,
      writingMode: "vertical-rl",
      whiteSpace: "nowrap",
      overflow: "hidden",
      color: disabled ? theme.vars.palette.text.disabled : theme.vars.palette.text.primary,
      flex: "1 1 auto",
      minHeight: 0,
      cursor: "pointer",
      background: "none",
      border: "none",
      padding: 0
    },
    ".device-card__kind": {
      ...TYPOGRAPHY.sans.caption,
      color: theme.vars.palette.text.secondary,
      whiteSpace: "nowrap",
      flexShrink: 0
    },
    ".device-card__grip": {
      display: "flex",
      alignItems: "center",
      cursor: "grab",
      color: theme.vars.palette.text.disabled,
      borderRadius: BORDER_RADIUS.xs,
      "&:hover": { color: theme.vars.palette.text.secondary },
      "&:focus-visible": { outline: `2px solid ${theme.vars.palette.primary.main}` },
      "&:active": { cursor: "grabbing" }
    },
    ".device-card__body": {
      flex: "1 1 auto",
      minHeight: 0,
      overflow: stacked ? "visible" : "auto",
      overscrollBehavior: "contain",
      scrollbarWidth: "thin",
      scrollbarGutter: stacked ? undefined : "stable",
      padding: theme.spacing(SPACING.xs),
      opacity: disabled ? 0.55 : 1,
      transition: MOTION.opacity
    },
    "&::before": dragOver
      ? {
          content: '""',
          position: "absolute",
          top: 0,
          bottom: 0,
          [dragOver]: `-${theme.spacing(SPACING.xs)}`,
          width: theme.spacing(SPACING.micro),
          borderRadius: BORDER_RADIUS.xs,
          backgroundColor: theme.vars.palette.primary.main,
          pointerEvents: "none"
        }
      : undefined
  });
};

export const DeviceCard: React.FC<DeviceCardProps> = memo(
  ({
    title,
    kind,
    collapsed,
    onToggleCollapsed,
    enabled,
    onEnabledChange,
    onRemove,
    index,
    onMove,
    width = "max-content",
    layout = "row",
    testId,
    children
  }) => {
    const theme = useTheme();
    const [dragOver, setDragOver] = useState<"left" | "right" | null>(null);
    const [dragging, setDragging] = useState(false);
    const reorderable = index !== undefined && onMove !== undefined;

    const handleDragStart = useCallback(
      (e: React.DragEvent<HTMLDivElement>) => {
        if (index === undefined) return;
        e.dataTransfer.setData(DEVICE_DRAG_MIME, String(index));
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      },
      [index]
    );
    const handleDragEnd = useCallback(() => {
      setDragging(false);
      setDragOver(null);
    }, []);
    const handleDragOver = useCallback(
      (e: React.DragEvent<HTMLDivElement>) => {
        if (!reorderable || !e.dataTransfer.types.includes(DEVICE_DRAG_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = e.currentTarget.getBoundingClientRect();
        setDragOver(e.clientX - rect.left < rect.width / 2 ? "left" : "right");
      },
      [reorderable]
    );
    const handleDragLeave = useCallback(() => setDragOver(null), []);
    const handleDrop = useCallback(
      (e: React.DragEvent<HTMLDivElement>) => {
        setDragOver(null);
        if (index === undefined || !onMove) return;
        const raw = e.dataTransfer.getData(DEVICE_DRAG_MIME);
        if (!raw) return;
        e.preventDefault();
        const from = Number.parseInt(raw, 10);
        if (Number.isNaN(from) || from === index) return;
        const rect = e.currentTarget.getBoundingClientRect();
        let to = e.clientX - rect.left < rect.width / 2 ? index : index + 1;
        if (from < to) to -= 1;
        if (to !== from) onMove(from, to);
      },
      [index, onMove]
    );
    const handleGripKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (index === undefined || !onMove || !e.altKey) return;
        const delta = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
        if (delta === 0) return;
        e.preventDefault();
        onMove(index, index + delta);
      },
      [index, onMove]
    );

    const disabled = enabled === false;
    const stacked = layout === "stack";
    const cardCss = useMemo(
      () => cardStyles(theme, width, collapsed, dragOver, dragging, disabled, stacked),
      [theme, width, collapsed, dragOver, dragging, disabled, stacked]
    );

    const grip = reorderable ? (
      <Tooltip title="Drag to reorder, or Alt + arrow keys">
        <div
          className="device-card__grip"
          draggable
          role="button"
          tabIndex={0}
          aria-label={`Reorder ${title}`}
          aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onKeyDown={handleGripKeyDown}
        >
          <DragIndicatorIcon fontSize="small" />
        </div>
      </Tooltip>
    ) : null;

    const power =
      enabled !== undefined && onEnabledChange ? (
        <ToolbarIconButton
          icon={<PowerSettingsNewIcon fontSize="small" />}
          tooltip={enabled ? `Turn ${title} off` : `Turn ${title} on`}
          aria-label={`${title} on`}
          aria-pressed={enabled}
          active={enabled}
          onClick={() => onEnabledChange(!enabled)}
          size="small"
        />
      ) : null;

    const collapse = (
      <ToolbarIconButton
        icon={
          stacked ? (
            collapsed ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />
          ) : collapsed ? (
            <ChevronRightIcon fontSize="small" />
          ) : (
            <ChevronLeftIcon fontSize="small" />
          )
        }
        tooltip={collapsed ? `Expand ${title}` : `Collapse ${title}`}
        aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
        aria-expanded={!collapsed}
        onClick={onToggleCollapsed}
        size="small"
      />
    );

    return (
      <div
        css={cardCss}
        data-testid={testId}
        data-collapsed={collapsed}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {collapsed && !stacked ? (
          <div className="device-card__header">
            {collapse}
            {power}
            <button type="button" className="device-card__vertical-title" onClick={onToggleCollapsed}>
              {title}
            </button>
            {grip}
          </div>
        ) : (
          <>
            <div className="device-card__header">
              {grip}
              {power}
              <div className="device-card__label">
                <TruncatedText className="device-card__title">{title}</TruncatedText>
                {kind && <span className="device-card__kind">{kind}</span>}
              </div>
              <span className="device-card__spacer" />
              {onRemove && (
                <ToolbarIconButton
                  icon={<DeleteOutlineIcon fontSize="small" />}
                  tooltip={`Remove ${title}`}
                  aria-label={`Remove ${title}`}
                  onClick={onRemove}
                  size="small"
                />
              )}
              {collapse}
            </div>
            {!collapsed && <div className="device-card__body">{children}</div>}
          </>
        )}
      </div>
    );
  }
);

DeviceCard.displayName = "DeviceCard";
