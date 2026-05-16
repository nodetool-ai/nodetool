/**
 * Refine Selection Popover
 *
 * Groups all selection-modifying operations (Modify, Feather, Smooth, Border)
 * behind a single entry point. Each section owns its own parameter so the user
 * only sees the value they're about to apply.
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
  Label,
  Popover,
  Text
} from "../../../ui_primitives";
import { sketchSliderSx } from "../../sketchStyles";
import { cloneSelectionMask, MAX_SELECTION_FEATHER_RADIUS } from "../../selection";
import type { SelectSettings, Selection } from "../../types";
import { useSketchStore } from "../../state";

const MAX_BORDER_WIDTH = 64;
const MAX_MODIFY_PX = 64;

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

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

const Section = memo(function Section({ title, children }: SectionProps) {
  return (
    <FlexColumn gap={0.5} sx={{ width: "100%" }}>
      <Label
        sx={(theme) => ({
          fontSize: theme.fontSizeTinyer,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: theme.vars.palette.grey[400]
        })}
      >
        {title}
      </Label>
      {children}
    </FlexColumn>
  );
});

interface ParamRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

const ParamRow = memo(function ParamRow({
  label,
  value,
  min,
  max,
  onChange
}: ParamRowProps) {
  return (
    <FlexRow gap={2} align="center" sx={{ width: "100%", px: 0.5 }}>
      <Text
        sx={(theme) => ({
          fontSize: theme.fontSizeSmaller,
          color: theme.vars.palette.grey[200],
          minWidth: 52
        })}
      >
        {label}
      </Text>
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
          minWidth: 28,
          textAlign: "right"
        })}
      >
        {value}
      </Text>
    </FlexRow>
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
      maxWidth={320}
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
      <FlexColumn gap={2} sx={{ width: 300 }}>
        <Section title="Modify">
          <ParamRow
            label="Pixels"
            value={modifyPx}
            min={1}
            max={MAX_MODIFY_PX}
            onChange={setModifyPx}
          />
          <FlexRow gap={0.5}>
            <EditorButton
              variant="outlined"
              onClick={() => {
                expandCurrentSelection(modifyPx);
                markDirty();
              }}
              sx={{ flex: 1 }}
            >
              Grow
            </EditorButton>
            <EditorButton
              variant="outlined"
              onClick={() => {
                contractCurrentSelection(modifyPx);
                markDirty();
              }}
              sx={{ flex: 1 }}
            >
              Shrink
            </EditorButton>
          </FlexRow>
        </Section>

        <Section title="Feather">
          <ParamRow
            label="Radius"
            value={settings.featherRadius}
            min={0}
            max={MAX_SELECTION_FEATHER_RADIUS}
            onChange={(v) => onChange({ featherRadius: v })}
          />
          <EditorButton
            variant="outlined"
            onClick={() => {
              onFeatherSelection();
              markDirty();
            }}
            sx={{ alignSelf: "stretch" }}
          >
            Apply Feather
          </EditorButton>
        </Section>

        <Section title="Smooth">
          <EditorButton
            variant="outlined"
            onClick={() => {
              onSmoothSelectionBorders();
              markDirty();
            }}
            sx={{ alignSelf: "stretch" }}
          >
            Smooth Borders
          </EditorButton>
        </Section>

        <Section title="Border">
          <ParamRow
            label="Width"
            value={settings.borderWidth}
            min={1}
            max={MAX_BORDER_WIDTH}
            onChange={(v) => onChange({ borderWidth: v })}
          />
          <EditorButton
            variant="outlined"
            onClick={() => {
              onConvertSelectionToBorder();
              markDirty();
            }}
            sx={{ alignSelf: "stretch" }}
          >
            Apply Border
          </EditorButton>
        </Section>

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
