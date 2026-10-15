/**
 * DropZone
 *
 * The one file drop target. Three states share one look across the app:
 *   idle    1px dashed divider
 *   over    2px dashed primary outline + selected fill
 *   reject  2px dashed error outline (drag carries something not accepted)
 *
 * `overlay` mode is for whole-panel drops: the children render untouched and a
 * translucent label layer with the "over" outline covers them while a drag is
 * over the panel.
 *
 * Drag-over state is tracked internally (`useDragOverState`) unless `over` is
 * passed. Class-based surfaces (the property editors) use the exported style
 * helpers instead of the component.
 */

import React, { memo, useCallback } from "react";
import type { CSSObject } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import type { SxProps } from "@mui/material/styles";
import Box from "@mui/material/Box";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { useDragOverState } from "../../hooks/handlers/useDragOverState";
import {
  BORDER_RADIUS,
  FONT_WEIGHT,
  MOTION,
  Z_INDEX,
  reducedMotion,
  sxEntries
} from "./tokens";
import { SPACING } from "./spacing";

export type DropZoneState = "idle" | "over" | "reject";

/** Outline for the over / reject states; also used by CheckerDropzone. */
export const dropZoneOutline = (
  theme: Theme,
  state: Exclude<DropZoneState, "idle">
): CSSObject => ({
  outline: `2px dashed ${
    state === "reject"
      ? theme.vars.palette.error.main
      : theme.vars.palette.primary.main
  }`,
  outlineOffset: "-2px"
});

/** Full drag-over look (outline + fill) for class-based `.drag-over` rules. */
export const dropZoneOverStyle = (theme: Theme): CSSObject => ({
  ...dropZoneOutline(theme, "over"),
  backgroundColor: theme.vars.palette.action.selected
});

/** Reject look for class-based `.drop-reject` rules. */
export const dropZoneRejectStyle = (theme: Theme): CSSObject => ({
  ...dropZoneOutline(theme, "reject"),
  backgroundColor: theme.vars.palette.action.hover
});

/** Idle look plus the shared hover and drag states, for a `.dropzone` rule. */
export const dropZoneSurfaceStyle = (theme: Theme): CSSObject => ({
  position: "relative",
  transition: MOTION.all,
  ...reducedMotion({ transition: MOTION.none }),
  outline: `1px dashed ${theme.vars.palette.divider}`,
  backgroundColor: theme.vars.palette.Paper.overlay,
  borderRadius: BORDER_RADIUS.md,
  "&:hover": {
    outline: `1px dashed ${theme.vars.palette.text.secondary}`,
    backgroundColor: theme.vars.palette.action.selected
  },
  "&.drag-over": dropZoneOverStyle(theme),
  "&.drop-reject": dropZoneRejectStyle(theme)
});

export interface DropZoneProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onDrop"> {
  /** Called with the dropped files. When set, the zone handles the drop events itself. */
  onFilesDrop?: (files: File[]) => void;
  /** Force the over state (controlled). Defaults to tracking the drag internally. */
  over?: boolean;
  /** Show the reject state (wins over `over`). */
  reject?: boolean;
  /** Whole-panel mode: children stay as-is, a label layer covers them while over. */
  overlay?: boolean;
  /** Label of the overlay layer */
  overlayLabel?: React.ReactNode;
  /** Only react to drags that carry files (default true with `onFilesDrop`) */
  filesOnly?: boolean;
  /** Delay in ms before leaving the over state, to ride out child dragleave flicker */
  leaveDelayMs?: number;
  /** Raw drop handler for targets that read the DataTransfer themselves */
  onDrop?: React.DragEventHandler<HTMLDivElement>;
  sx?: SxProps<Theme>;
}

const DropZoneInner: React.FC<DropZoneProps> = ({
  onFilesDrop,
  over,
  reject = false,
  overlay = false,
  overlayLabel = "Drop files to upload",
  filesOnly,
  leaveDelayMs,
  onDrop,
  onDragEnter,
  onDragOver,
  onDragLeave,
  children,
  className,
  sx,
  ...rest
}) => {
  const tracking = useDragOverState({
    filesOnly: filesOnly ?? Boolean(onFilesDrop),
    leaveDelayMs
  });
  const isOver = over ?? tracking.isOver;
  const state: DropZoneState = reject ? "reject" : isOver ? "over" : "idle";
  const handlesFiles = Boolean(onFilesDrop);

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (handlesFiles) {
        e.preventDefault();
        e.stopPropagation();
      }
      tracking.onDragOver(e);
      (e.type === "dragenter" ? onDragEnter : onDragOver)?.(e);
    },
    [handlesFiles, tracking, onDragEnter, onDragOver]
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (handlesFiles) {
        e.preventDefault();
        e.stopPropagation();
      }
      tracking.onDragLeave(e);
      onDragLeave?.(e);
    },
    [handlesFiles, tracking, onDragLeave]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      tracking.reset();
      if (onFilesDrop) {
        e.preventDefault();
        e.stopPropagation();
        const files = Array.from(e.dataTransfer?.files ?? []);
        if (files.length > 0) {
          onFilesDrop(files);
        }
      }
      onDrop?.(e);
    },
    [tracking, onFilesDrop, onDrop]
  );

  return (
    <Box
      {...rest}
      className={`drop-zone drop-zone-${state}${className ? ` ${className}` : ""}`}
      data-state={state}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      sx={[
        (theme) => {
          const base: CSSObject = {
            position: "relative",
            borderRadius: BORDER_RADIUS.md,
            transition: MOTION.all,
            ...reducedMotion({ transition: MOTION.none })
          };
          if (overlay) {
            return base;
          }
          if (state === "reject") {
            return { ...base, ...dropZoneRejectStyle(theme) };
          }
          if (state === "over") {
            return { ...base, ...dropZoneOverStyle(theme) };
          }
          return {
            ...base,
            outline: `1px dashed ${theme.vars.palette.divider}`,
            backgroundColor: theme.vars.palette.Paper.overlay
          };
        },
        ...sxEntries(sx)
      ]}
    >
      {children}
      {overlay && state !== "idle" && (
        <DropZoneOverlay state={state} label={overlayLabel} />
      )}
    </Box>
  );
};

export interface DropZoneOverlayProps {
  state?: Exclude<DropZoneState, "idle">;
  label?: React.ReactNode;
}

/** The label layer of an `overlay` drop zone. Pointer events pass through. */
export const DropZoneOverlay: React.FC<DropZoneOverlayProps> = ({
  state = "over",
  label = "Drop files to upload"
}) => (
  <Box
    className="drop-zone-overlay"
    sx={(theme) => ({
      position: "absolute",
      inset: 0,
      zIndex: Z_INDEX.overlay,
      pointerEvents: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing(SPACING.md),
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.6)`,
      color:
        state === "reject"
          ? theme.vars.palette.error.main
          : theme.vars.palette.primary.main,
      fontSize: theme.fontSizeNormal,
      fontWeight: FONT_WEIGHT.semibold,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      ...dropZoneOutline(theme, state)
    })}
  >
    <UploadFileIcon fontSize="small" />
    {label}
  </Box>
);

export const DropZone = memo(DropZoneInner);
DropZone.displayName = "DropZone";

export default DropZone;
