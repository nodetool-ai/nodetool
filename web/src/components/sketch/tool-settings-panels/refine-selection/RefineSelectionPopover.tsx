/**
 * Refine Selection Popover
 *
 * Groups all selection-modifying operations (Modify, Feather, Smooth, Border)
 * behind a single entry point. Each section owns its own parameter so the user
 * only sees the value they're about to apply.
 *
 * Phase 1: actions commit immediately (matches existing behavior). A future
 * phase will add staged Apply/Cancel with a preview mask.
 */

import React, { memo, useState } from "react";
import { Box, Slider } from "@mui/material";
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
import { MAX_SELECTION_FEATHER_RADIUS } from "../../selection";
import type { SelectSettings } from "../../types";
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
    <FlexRow gap={1} align="center" sx={{ width: "100%" }}>
      <Text
        sx={(theme) => ({
          fontSize: theme.fontSizeSmaller,
          color: theme.vars.palette.grey[200],
          minWidth: 44
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

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      placement="bottom-left"
      maxWidth={320}
      paperSx={{
        backgroundColor: theme.vars.palette.grey[900],
        border: `1px solid ${theme.vars.palette.grey[700]}`,
        padding: 1.5
      }}
    >
      <FlexColumn gap={1.5} sx={{ width: 280 }}>
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
              onClick={() => expandCurrentSelection(modifyPx)}
              sx={{ flex: 1 }}
            >
              Grow
            </EditorButton>
            <EditorButton
              variant="outlined"
              onClick={() => contractCurrentSelection(modifyPx)}
              sx={{ flex: 1 }}
            >
              Shrink
            </EditorButton>
          </FlexRow>
        </Section>

        <Box
          sx={{
            height: 1,
            backgroundColor: theme.vars.palette.grey[800]
          }}
        />

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
            onClick={onFeatherSelection}
            sx={{ alignSelf: "stretch" }}
          >
            Apply Feather
          </EditorButton>
        </Section>

        <Box
          sx={{
            height: 1,
            backgroundColor: theme.vars.palette.grey[800]
          }}
        />

        <Section title="Smooth">
          <EditorButton
            variant="outlined"
            onClick={onSmoothSelectionBorders}
            sx={{ alignSelf: "stretch" }}
          >
            Smooth Borders
          </EditorButton>
        </Section>

        <Box
          sx={{
            height: 1,
            backgroundColor: theme.vars.palette.grey[800]
          }}
        />

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
            onClick={onConvertSelectionToBorder}
            sx={{ alignSelf: "stretch" }}
          >
            Apply Border
          </EditorButton>
        </Section>
      </FlexColumn>
    </Popover>
  );
});
