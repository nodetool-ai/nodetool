/** @jsxImportSource @emotion/react */
/**
 * The Step Editor toolbar: Lanes, Edit, Functions and View menus, the MIDI
 * Out and Catch toggles, the two tool menus, the position display and the two
 * zoom sliders. The menu, toggle and tool-menu pieces are the piano roll's.
 */

import React, { memo, useCallback, useState, type ReactNode, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PianoIcon from "@mui/icons-material/Piano";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";

import {
  Caption,
  ContextMenu,
  FlexRow,
  MenuItemPrimitive,
  Slider,
  SPACING,
  ToolbarIconButton,
  TYPOGRAPHY
} from "../../ui_primitives";
import type {
  PianoRollSettings,
  StepEditorTool
} from "../../../stores/timeline/TimelineUIStore";
import {
  MenuButton,
  type MenuRow
} from "../pianoRoll/PianoRollMenus";
import {
  TOOL_ICONS,
  ZOOM_SLIDER_STEPS,
  ZOOM_SLIDER_WIDTH_PX,
  toggleSx,
  type ToggleColor
} from "../pianoRoll/PianoRollToolbar";

/** Every Step Editor tool, in menu order. */
export const STEP_EDITOR_TOOLS: readonly StepEditorTool[] = [
  "pointer",
  "pencil",
  "line",
  "eraser"
];

const STEP_TOOL_ICONS: Record<StepEditorTool, React.ReactElement> = {
  pointer: TOOL_ICONS.pointer,
  pencil: TOOL_ICONS.pencil,
  line: <TrendingUpIcon />,
  eraser: TOOL_ICONS.eraser
};

const toolNameKey = (tool: StepEditorTool): string =>
  tool === "line"
    ? "pass3_20.stepEditor.tool.line"
    : `pass3_20.pianoRoll.logic.tool.${tool}`;

interface StepToolMenuProps {
  tool: StepEditorTool;
  label: string;
  onPick: (tool: StepEditorTool) => void;
}

const StepToolMenu: React.FC<StepToolMenuProps> = ({ tool, label, onPick }) => {
  const { t } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const close = useCallback(() => setAnchorEl(null), []);
  return (
    <>
      <ToolbarIconButton
        tooltip={`${label}: ${t(toolNameKey(tool))}`}
        aria-haspopup="menu"
        aria-expanded={anchorEl !== null}
        sx={{ width: "auto", px: SPACING.xs, gap: SPACING.micro }}
        onClick={(event) => setAnchorEl(event.currentTarget)}
      >
        {STEP_TOOL_ICONS[tool]}
        <ExpandMoreIcon />
      </ToolbarIconButton>
      <ContextMenu open={anchorEl !== null} anchorEl={anchorEl} onClose={close}>
        {STEP_EDITOR_TOOLS.map((id) => (
          <MenuItemPrimitive
            key={id}
            icon={STEP_TOOL_ICONS[id]}
            label={t(toolNameKey(id))}
            checkable="radio"
            checked={id === tool}
            onClick={() => {
              close();
              onPick(id);
            }}
          />
        ))}
      </ContextMenu>
    </>
  );
};

export interface StepEditorToolbarProps {
  mac: boolean;
  lanesMenu: MenuRow[];
  editMenu: MenuRow[];
  functionsMenu: MenuRow[];
  viewMenu: MenuRow[];
  tool: StepEditorTool;
  altTool: StepEditorTool;
  onTool: (tool: StepEditorTool) => void;
  onAltTool: (tool: StepEditorTool) => void;
  /** MIDI Out and Catch are the piano roll's settings. */
  pianoRollSettings: PianoRollSettings;
  setPianoRollSettings: (patch: Partial<PianoRollSettings>) => void;
  positionRef: Ref<HTMLSpanElement>;
  hZoom: number;
  onHZoom: (position: number) => void;
  vZoom: number;
  onVZoom: (factor: number) => void;
  minVZoom: number;
  maxVZoom: number;
  start?: ReactNode;
  end?: ReactNode;
}

export const StepEditorToolbar: React.FC<StepEditorToolbarProps> = memo(
  ({
    mac,
    lanesMenu,
    editMenu,
    functionsMenu,
    viewMenu,
    tool,
    altTool,
    onTool,
    onAltTool,
    pianoRollSettings: settings,
    setPianoRollSettings: setSettings,
    positionRef,
    hZoom,
    onHZoom,
    vZoom,
    onVZoom,
    minVZoom,
    maxVZoom,
    start,
    end
  }) => {
    const { t } = useTranslation();
    const theme = useTheme();
    const L = (key: string) => t(`pass3_20.pianoRoll.logic.${key}`);
    const S = (key: string) => t(`pass3_20.stepEditor.${key}`);
    const toggle = (
      id: string,
      icon: ReactNode,
      label: string,
      active: boolean,
      onToggle: () => void,
      color: ToggleColor
    ) => (
      <ToolbarIconButton
        key={id}
        tooltip={label}
        aria-label={label}
        active={active}
        sx={toggleSx(theme, active, color)}
        onClick={onToggle}
      >
        {icon}
      </ToolbarIconButton>
    );
    return (
      <FlexRow
        fullWidth
        align="center"
        gap={SPACING.sm}
        data-testid="step-editor-toolbar"
        sx={{
          px: SPACING.sm,
          py: SPACING.xs,
          flexShrink: 0,
          flexWrap: "wrap",
          rowGap: SPACING.xs,
          borderBottom: `1px solid ${theme.vars.palette.divider}`
        }}
      >
        {start}
        <MenuButton label={S("menu.lanes")} rows={lanesMenu} />
        <MenuButton label={L("menu.edit")} rows={editMenu} />
        <MenuButton label={L("menu.functions")} rows={functionsMenu} />
        <MenuButton label={L("menu.view")} rows={viewMenu} />
        {toggle("midiOut", <PianoIcon />, L("toggle.midiOut"), settings.midiOut, () => setSettings({ midiOut: !settings.midiOut }), "success")}
        {toggle("catch", <CenterFocusStrongIcon />, L("toggle.catch"), settings.catchPlayhead, () => setSettings({ catchPlayhead: !settings.catchPlayhead }), "primary")}
        <StepToolMenu tool={tool} label={L("tool.left")} onPick={onTool} />
        <StepToolMenu tool={altTool} label={mac ? L("tool.cmd") : L("tool.ctrl")} onPick={onAltTool} />
        <Caption
          ref={positionRef}
          aria-live="off"
          data-testid="step-editor-position"
          sx={{ ...TYPOGRAPHY.mono.label, whiteSpace: "pre", minWidth: "18ch", textAlign: "center" }}
        />
        <FlexRow align="center" gap={SPACING.xs}>
          <UnfoldMoreIcon fontSize="small" aria-hidden />
          <Slider
            aria-label={L("zoom.vertical")}
            density="compact"
            min={minVZoom}
            max={maxVZoom}
            step={(maxVZoom - minVZoom) / ZOOM_SLIDER_STEPS}
            value={vZoom}
            sx={{ width: ZOOM_SLIDER_WIDTH_PX }}
            onChange={(_, value) => onVZoom(value as number)}
          />
        </FlexRow>
        <FlexRow align="center" gap={SPACING.xs}>
          <SwapHorizIcon fontSize="small" aria-hidden />
          <Slider
            aria-label={L("zoom.horizontal")}
            density="compact"
            min={0}
            max={1}
            step={1 / ZOOM_SLIDER_STEPS}
            value={hZoom}
            sx={{ width: ZOOM_SLIDER_WIDTH_PX }}
            onChange={(_, value) => onHZoom(value as number)}
          />
        </FlexRow>
        <FlexRow sx={{ marginLeft: "auto" }} align="center" gap={SPACING.xs}>
          {end}
        </FlexRow>
      </FlexRow>
    );
  }
);

StepEditorToolbar.displayName = "StepEditorToolbar";
