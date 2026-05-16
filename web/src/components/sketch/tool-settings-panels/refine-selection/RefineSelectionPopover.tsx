/**
 * Refine Selection Popover
 *
 * Groups all selection-modifying operations (Modify, Feather, Smooth, Border)
 * behind a single entry point. Each row is one operation: name → slider →
 * value → apply button on the right.
 *
 * Apply / Cancel staging: on open, snapshots the current selection mask. Each
 * operation mutates the live mask (visible immediately on canvas). Cancel /
 * Escape restores the snapshot. Apply / click-outside keeps the changes.
 */

import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { Slider } from "@mui/material";
import { useTheme } from "@mui/material/styles";

import {
  EditorButton,
  FlexColumn,
  FlexRow,
  Popover,
  Text
} from "../../../ui_primitives";
import { sketchSliderSx } from "../../sketchStyles";
import { cloneSelectionMask, MAX_SELECTION_FEATHER_RADIUS } from "../../selection";
import type { SelectSettings, Selection } from "../../types";
import { useSketchStore } from "../../state";

const MAX_BORDER_WIDTH = 64;
const MAX_MODIFY_PX = 64;

const LABEL_WIDTH = 56;
const VALUE_WIDTH = 28;
const APPLY_WIDTH = 60;

export interface RefineSelectionPopoverProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  settings: SelectSettings;
  onChange: (settings: Partial<SelectSettings>) => void;
  onFeatherSelection: () => void;
  onSmoothSelectionBorders: () => void;
  onConvertSelectionToBorder: () => void;
}

interface RefineRowProps {
  label: string;
  /** Slider value, or `null` to render a button-only row (no slider, no value). */
  value: number | null;
  min?: number;
  max?: number;
  onChange?: (value: number) => void;
  /** Right-aligned action button. Use `null` for a row with custom right side. */
  action: React.ReactNode;
}

const RefineRow = memo(function RefineRow({
  label,
  value,
  min,
  max,
  onChange,
  action
}: RefineRowProps) {
  return (
    <FlexRow gap={2} align="center" sx={{ width: "100%", px: 0.5 }}>
      <Text
        sx={(theme) => ({
          fontSize: theme.fontSizeSmaller,
          color: theme.vars.palette.grey[200],
          minWidth: LABEL_WIDTH
        })}
      >
        {label}
      </Text>
      {value !== null && min !== undefined && max !== undefined && onChange ? (
        <>
          <Slider
            sx={sketchSliderSx}
            size="small"
            min={min}
            max={max}
            value={value}
            onChange={(_, v) => onChange(v as number)}
          />
          <Text
            sx={(theme) => ({
              fontSize: theme.fontSizeSmaller,
              color: theme.vars.palette.grey[100],
              minWidth: VALUE_WIDTH,
              textAlign: "right"
            })}
          >
            {value}
          </Text>
        </>
      ) : (
        <FlexRow sx={{ flex: 1 }} />
      )}
      {action}
    </FlexRow>
  );
});

interface ApplyButtonProps {
  onClick: () => void;
  children: React.ReactNode;
}

const ApplyButton = memo(function ApplyButton({
  onClick,
  children
}: ApplyButtonProps) {
  return (
    <EditorButton
      variant="outlined"
      onClick={onClick}
      sx={{ minWidth: APPLY_WIDTH, flexShrink: 0 }}
    >
      {children}
    </EditorButton>
  );
});

export const RefineSelectionPopover = memo(function RefineSelectionPopover({
  open,
  anchorEl,
  onClose,
  settings,
  onChange,
  onFeatherSelection,
  onSmoothSelectionBorders,
  onConvertSelectionToBorder
}: RefineSelectionPopoverProps) {
  const theme = useTheme();
  const [modifyPx, setModifyPx] = useState(1);
  const expandCurrentSelection = useSketchStore(
    (s) => s.expandCurrentSelection
  );
  const contractCurrentSelection = useSketchStore(
    (s) => s.contractCurrentSelection
  );
  const setSelection = useSketchStore((s) => s.setSelection);

  // Snapshot of the selection at popover-open time. Restored on Cancel / Escape.
  // `dirty` tracks whether any op has run since the snapshot — keeps Cancel a
  // no-op when nothing changed (avoids needless re-renders / GPU uploads).
  const snapshotRef = useRef<Selection | null>(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!open) {
      snapshotRef.current = null;
      dirtyRef.current = false;
      return;
    }
    const current = useSketchStore.getState().selection;
    snapshotRef.current = current ? cloneSelectionMask(current) : null;
    dirtyRef.current = false;
  }, [open]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  const handleApply = useCallback(() => {
    snapshotRef.current = null;
    dirtyRef.current = false;
    onClose();
  }, [onClose]);

  const handleCancel = useCallback(() => {
    if (dirtyRef.current) {
      const snap = snapshotRef.current;
      setSelection(snap ? cloneSelectionMask(snap) : null);
    }
    snapshotRef.current = null;
    dirtyRef.current = false;
    onClose();
  }, [onClose, setSelection]);

  // MUI Popover's onClose fires for both backdrop click and escape — split them
  // so escape = Cancel (discard) and backdrop click = Apply (keep, less
  // destructive default for an accidental click outside).
  const handlePopoverClose = useCallback(
    (_event: object, reason: "backdropClick" | "escapeKeyDown") => {
      if (reason === "escapeKeyDown") {
        handleCancel();
      } else {
        handleApply();
      }
    },
    [handleApply, handleCancel]
  );

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={handlePopoverClose}
      placement="bottom-left"
      maxWidth={380}
      // Non-modal behavior: keep canvas interactive (pan / zoom / shortcuts)
      // while the popover is open. Focus stays on the canvas, backdrop is
      // removed, and scroll-lock is disabled.
      disableAutoFocus
      disableEnforceFocus
      disableRestoreFocus
      disableScrollLock
      hideBackdrop
      paperSx={{
        backgroundColor: theme.vars.palette.grey[900],
        border: `1px solid ${theme.vars.palette.grey[700]}`,
        padding: 2.5,
        pointerEvents: "auto"
      }}
      slotProps={{
        root: { style: { pointerEvents: "none" } }
      }}
    >
      <FlexColumn gap={1.5} sx={{ width: 340 }}>
        <RefineRow
          label="Modify"
          value={modifyPx}
          min={1}
          max={MAX_MODIFY_PX}
          onChange={setModifyPx}
          action={
            <FlexRow gap={0.5} sx={{ flexShrink: 0 }}>
              <ApplyButton
                onClick={() => {
                  expandCurrentSelection(modifyPx);
                  markDirty();
                }}
              >
                Grow
              </ApplyButton>
              <ApplyButton
                onClick={() => {
                  contractCurrentSelection(modifyPx);
                  markDirty();
                }}
              >
                Shrink
              </ApplyButton>
            </FlexRow>
          }
        />

        <RefineRow
          label="Feather"
          value={settings.featherRadius}
          min={0}
          max={MAX_SELECTION_FEATHER_RADIUS}
          onChange={(v) => onChange({ featherRadius: v })}
          action={
            <ApplyButton
              onClick={() => {
                onFeatherSelection();
                markDirty();
              }}
            >
              Apply
            </ApplyButton>
          }
        />

        <RefineRow
          label="Smooth"
          value={null}
          action={
            <ApplyButton
              onClick={() => {
                onSmoothSelectionBorders();
                markDirty();
              }}
            >
              Apply
            </ApplyButton>
          }
        />

        <RefineRow
          label="Border"
          value={settings.borderWidth}
          min={1}
          max={MAX_BORDER_WIDTH}
          onChange={(v) => onChange({ borderWidth: v })}
          action={
            <ApplyButton
              onClick={() => {
                onConvertSelectionToBorder();
                markDirty();
              }}
            >
              Apply
            </ApplyButton>
          }
        />

        <FlexRow gap={1} justify="flex-end" sx={{ mt: 1 }}>
          <EditorButton variant="outlined" onClick={handleCancel}>
            Cancel
          </EditorButton>
          <EditorButton variant="contained" onClick={handleApply}>
            Apply
          </EditorButton>
        </FlexRow>
      </FlexColumn>
    </Popover>
  );
});
