/** @jsxImportSource @emotion/react */
/**
 * The piano roll's toolbar: menus, view toggles, tool menus, the position
 * display, snap, drag mode and the two zoom sliders, in one row that wraps
 * when the panel is narrow.
 */

import React, { memo, useCallback, useState, type ReactNode, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import NearMeIcon from "@mui/icons-material/NearMe";
import EditIcon from "@mui/icons-material/Edit";
import BrushIcon from "@mui/icons-material/Brush";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import CallMergeIcon from "@mui/icons-material/CallMerge";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";
import EqualizerIcon from "@mui/icons-material/Equalizer";
import GridOnIcon from "@mui/icons-material/GridOn";
import BackspaceIcon from "@mui/icons-material/Backspace";
import LinkIcon from "@mui/icons-material/Link";
import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import PianoIcon from "@mui/icons-material/Piano";
import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import KeyboardOutlinedIcon from "@mui/icons-material/KeyboardOutlined";

import {
  Caption,
  ContextMenu,
  FlexRow,
  MenuItemPrimitive,
  SelectField,
  Slider,
  SPACING,
  ToolbarIconButton,
  TYPOGRAPHY
} from "../../ui_primitives";
import type {
  PianoRollSettings,
  PianoRollTool
} from "../../../stores/timeline/TimelineUIStore";
import type { TempoGridDivision } from "@nodetool-ai/timeline";
import { GRID_DIVISION_OPTIONS } from "../Tracks/tempoGrid";
import { PianoRollMenus, type PianoRollMenusProps } from "./PianoRollMenus";
import { PIANO_ROLL_TOOLS } from "./pianoRollTools";

export const TOOL_ICONS: Record<PianoRollTool, React.ReactElement> = {
  pointer: <NearMeIcon />,
  pencil: <EditIcon />,
  eraser: <BackspaceIcon />,
  brush: <BrushIcon />,
  scissors: <ContentCutIcon />,
  glue: <CallMergeIcon />,
  mute: <VolumeOffIcon />,
  velocity: <EqualizerIcon />,
  quantize: <GridOnIcon />
};

/** The slider range of the zoom sliders. The horizontal one is log-scaled by the caller. */
export const ZOOM_SLIDER_STEPS = 1000;
export const ZOOM_SLIDER_WIDTH_PX = 72;

export type ToggleColor = "success" | "primary" | "warning";

export const toggleSx = (theme: Theme, active: boolean, color: ToggleColor) =>
  active
    ? {
        backgroundColor: theme.vars.palette[color].main,
        color: theme.vars.palette[color].contrastText,
        "&:hover": {
          backgroundColor: theme.vars.palette[color].dark,
          color: theme.vars.palette[color].contrastText
        }
      }
    : undefined;

interface ToolMenuProps {
  tool: PianoRollTool;
  label: string;
  onPick: (tool: PianoRollTool) => void;
}

const ToolMenu: React.FC<ToolMenuProps> = ({ tool, label, onPick }) => {
  const { t } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const close = useCallback(() => setAnchorEl(null), []);
  const toolName = t(`pass3_20.pianoRoll.logic.tool.${tool}`);
  return (
    <>
      <ToolbarIconButton
        tooltip={`${label}: ${toolName}`}
        aria-haspopup="menu"
        aria-expanded={anchorEl !== null}
        sx={{ width: "auto", px: SPACING.xs, gap: SPACING.micro }}
        onClick={(event) => setAnchorEl(event.currentTarget)}
      >
        {TOOL_ICONS[tool]}
        <ExpandMoreIcon />
      </ToolbarIconButton>
      <ContextMenu open={anchorEl !== null} anchorEl={anchorEl} onClose={close}>
        {PIANO_ROLL_TOOLS.map((id) => (
          <MenuItemPrimitive
            key={id}
            icon={TOOL_ICONS[id]}
            label={t(`pass3_20.pianoRoll.logic.tool.${id}`)}
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

export interface PianoRollToolbarProps extends Omit<PianoRollMenusProps, "hasNotes" | "scaleReady"> {
  hasNotes: boolean;
  scaleReady: boolean;
  positionRef: Ref<HTMLSpanElement>;
  /** Horizontal zoom as a 0..1 position on the log scale. */
  hZoom: number;
  onHZoom: (position: number) => void;
  /** Row height factor, 0.5..2. */
  vZoom: number;
  onVZoom: (factor: number) => void;
  minVZoom: number;
  maxVZoom: number;
  /** Leading controls, such as the phone Back button. */
  start?: ReactNode;
  /** Trailing controls, such as Close. */
  end?: ReactNode;
}

export const PianoRollToolbar: React.FC<PianoRollToolbarProps> = memo(
  ({ positionRef, hZoom, onHZoom, vZoom, onVZoom, minVZoom, maxVZoom, start, end, ...menus }) => {
    const { t } = useTranslation();
    const theme = useTheme();
    const { settings, setSettings, mac } = menus;
    const L = (key: string) => t(`pass3_20.pianoRoll.logic.${key}`);
    const snapOptions = [
      { value: "smart", label: L("snap.smart") },
      ...GRID_DIVISION_OPTIONS
    ];
    const toggle = (
      id: string,
      icon: ReactNode,
      label: string,
      active: boolean,
      onToggle: () => void,
      color?: ToggleColor
    ) => (
      <ToolbarIconButton
        key={id}
        tooltip={label}
        aria-label={label}
        active={active}
        sx={color ? toggleSx(theme, active, color) : undefined}
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
        data-testid="piano-roll-toolbar"
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
        <PianoRollMenus {...menus} />
        {toggle("collapse", <UnfoldLessIcon />, L("toggle.collapseMode"), settings.collapse, () => setSettings({ collapse: !settings.collapse }))}
        {toggle("midiDraw", <ShowChartIcon />, L("toggle.midiDraw"), settings.midiDraw, () => setSettings({ midiDraw: !settings.midiDraw }))}
        {toggle("midiOut", <PianoIcon />, L("toggle.midiOut"), settings.midiOut, () => setSettings({ midiOut: !settings.midiOut }), "success")}
        {toggle("catch", <CenterFocusStrongIcon />, L("toggle.catch"), settings.catchPlayhead, () => setSettings({ catchPlayhead: !settings.catchPlayhead }), "primary")}
        {toggle("link", <LinkIcon />, L("toggle.link"), settings.link, () => setSettings({ link: !settings.link }), "warning")}
        <ToolMenu tool={settings.tool} label={L("tool.left")} onPick={(tool) => setSettings({ tool })} />
        <ToolMenu tool={settings.altTool} label={mac ? L("tool.cmd") : L("tool.ctrl")} onPick={(altTool) => setSettings({ altTool })} />
        <Caption
          ref={positionRef}
          aria-live="off"
          data-testid="piano-roll-position"
          sx={{ ...TYPOGRAPHY.mono.label, whiteSpace: "pre", minWidth: "18ch", textAlign: "center" }}
        />
        <Caption color="muted">{L("snap.label")}</Caption>
        {toggle("snapOn", <PowerSettingsNewIcon />, L("snap.toggle"), settings.snapOn, () => setSettings({ snapOn: !settings.snapOn }))}
        <SelectField
          label={L("snap.value")}
          hideLabel
          size="small"
          value={settings.snapValue}
          options={snapOptions}
          css={css({ width: "14ch" })}
          onChange={(value) => setSettings({ snapValue: value as "smart" | TempoGridDivision })}
        />
        <Caption color="muted">{L("dragMode.label")}</Caption>
        <SelectField
          label={L("dragMode.title")}
          hideLabel
          size="small"
          value={settings.dragMode}
          options={[
            { value: "overlap", label: L("dragMode.overlap") },
            { value: "noOverlap", label: L("dragMode.noOverlap") }
          ]}
          css={css({ width: "14ch" })}
          onChange={(value) => setSettings({ dragMode: value as PianoRollSettings["dragMode"] })}
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
          <ToolbarIconButton onClick={menus.onShortcuts} tooltip={t("pass3_20.pianoRoll.shortcuts.titleWithHint")} aria-label={t("pass3_20.pianoRoll.shortcuts.title")}>
            <KeyboardOutlinedIcon fontSize="small" />
          </ToolbarIconButton>
          {end}
        </FlexRow>
      </FlexRow>
    );
  }
);

PianoRollToolbar.displayName = "PianoRollToolbar";
