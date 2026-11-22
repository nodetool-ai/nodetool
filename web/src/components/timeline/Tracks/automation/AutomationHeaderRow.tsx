/** @jsxImportSource @emotion/react */
/**
 * AutomationHeaderRow — the second row of a track header while Show
 * Automation is on: the disclosure triangle for the sub-lanes, the automation
 * mode, the shown parameter and its value at the playhead.
 */

import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  automationModeOf,
  automationTargetKey,
  type AutomationMode,
  type TimelineTrack
} from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";
import { SPACING, ToolbarIconButton, getSpacingPx } from "../../../ui_primitives";
import { trackHeaderWidthCss } from "../TrackHeader";
import { AUTOMATION_HEADER_ROW_PX, shownAutomationKey } from "./automationLayout";
import { automationRoleOf, automationTargetSpecs } from "./automationTargets";
import {
  AutomationMenuButton,
  type AutomationMenuEntry,
  type AutomationMenuTone
} from "./AutomationMenuButton";
import { AutomationValueReadout } from "./AutomationValueReadout";

export const AUTOMATION_MODES: readonly AutomationMode[] = ["off", "read", "touch", "latch", "write"];

/** The fill of the mode select: Off is neutral, the others carry a status color. */
export function automationModeTone(mode: AutomationMode): AutomationMenuTone {
  switch (mode) {
    case "off":
      return { kind: "neutral" };
    case "read":
      return { kind: "fill", role: "success" };
    case "touch":
      return { kind: "fill", role: "warning" };
    case "latch":
      return { kind: "fill", role: "secondary" };
    case "write":
      return { kind: "fill", role: "error" };
  }
}

export const automationRowStyles = (theme: Theme, heightPx: number) =>
  css({
    width: trackHeaderWidthCss,
    height: heightPx,
    flexShrink: 0,
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    gap: getSpacingPx(SPACING.xs),
    padding: `0 ${getSpacingPx(SPACING.sm)} 0 ${getSpacingPx(SPACING.xs)}`,
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    background: theme.vars.palette.background.paper,
    color: theme.vars.palette.text.secondary,
    minWidth: 0
  });

interface Props {
  track: TimelineTrack;
}

export const AutomationHeaderRow: React.FC<Props> = memo(({ track }) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const open = useTimelineUIStore((s) => s.automationOpenTrackIds.includes(track.id));
  const toggleOpen = useTimelineUIStore((s) => s.toggleAutomationSubLanes);
  const storedKey = useTimelineUIStore((s) => s.automationShownParams[track.id]);
  const setShownParam = useTimelineUIStore((s) => s.setAutomationShownParam);
  const setMode = useTimelineStore((s) => s.setTrackAutomationMode);

  const specs = useMemo(() => automationTargetSpecs(track, t), [track, t]);
  const shownKey = shownAutomationKey(track, storedKey, new Set(specs.map((s) => s.key)));
  const spec = specs.find((s) => s.key === shownKey);
  const mode = automationModeOf(track);
  const withPoints = useMemo(
    () =>
      new Set(
        (track.automation ?? [])
          .filter((lane) => lane.points.length > 0)
          .map((lane) => automationTargetKey(lane.target))
      ),
    [track.automation]
  );

  const entries = useMemo<AutomationMenuEntry[]>(
    () =>
      specs.map((s) => ({ key: s.key, label: s.label, group: s.group, dot: withPoints.has(s.key) })),
    [specs, withPoints]
  );
  const modeEntries = useMemo<AutomationMenuEntry[]>(
    () => AUTOMATION_MODES.map((m) => ({ key: m, label: t(`timelineAutomation.modes.${m}`) })),
    [t]
  );

  const role = spec ? automationRoleOf(specs, spec.target) : "primary";
  const color = theme.vars.palette[role].main;
  const toggle = useCallback(() => toggleOpen(track.id), [toggleOpen, track.id]);
  const selectParam = useCallback((key: string) => setShownParam(track.id, key), [setShownParam, track.id]);
  const selectMode = useCallback(
    (key: string) => setMode(track.id, key as AutomationMode),
    [setMode, track.id]
  );

  const toggleLabel = open ? t("timelineAutomation.hideLanes") : t("timelineAutomation.showLanes");

  return (
    <div css={automationRowStyles(theme, AUTOMATION_HEADER_ROW_PX)} data-testid={`automation-header-${track.id}`}>
      <ToolbarIconButton
        icon={open ? <ExpandMoreIcon /> : <ChevronRightIcon />}
        size="small"
        tooltip={toggleLabel}
        ariaLabel={toggleLabel}
        aria-expanded={open}
        onClick={toggle}
        data-testid={`automation-disclosure-${track.id}`}
      />
      <AutomationMenuButton
        label={t(`timelineAutomation.modes.${mode}`)}
        value={mode}
        entries={modeEntries}
        onSelect={selectMode}
        tone={automationModeTone(mode)}
        ariaLabel={t("timelineAutomation.mode")}
        testId={`automation-mode-${track.id}`}
        disabled={track.locked}
      />
      <AutomationMenuButton
        label={spec?.label ?? t("timelineAutomation.missingTarget")}
        value={shownKey}
        entries={entries}
        onSelect={selectParam}
        tone={{ kind: "text", color }}
        ariaLabel={t("timelineAutomation.parameter")}
        testId={`automation-param-${track.id}`}
        dot={withPoints.has(shownKey)}
        grow
      />
      {spec && <AutomationValueReadout track={track} spec={spec} color={color} />}
    </div>
  );
});

AutomationHeaderRow.displayName = "AutomationHeaderRow";
