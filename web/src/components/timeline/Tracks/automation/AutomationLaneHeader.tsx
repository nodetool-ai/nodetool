/** @jsxImportSource @emotion/react */
/**
 * The header-column side of a track's automation: one row per lane naming
 * the control it drives, with its on switch and remove button, and a last row
 * that picks a control for a new lane.
 */

import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import CloseIcon from "@mui/icons-material/Close";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import {
  automationTargetKey,
  createAutomationLane,
  type AutomationLane,
  type TimelineTrack
} from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import {
  Autocomplete,
  FONT_SIZE_SANS,
  FONT_WEIGHT,
  SPACING,
  ToolbarIconButton,
  getSpacingPx
} from "../../../ui_primitives";
import { trackHeaderWidthCss } from "../TrackHeader";
import { AUTOMATION_FOOTER_HEIGHT_PX, AUTOMATION_LANE_HEIGHT_PX } from "./automationLayout";
import { automationTargetSpec, automationTargetSpecs, type AutomationTargetSpec } from "./automationTargets";

const rowStyles = (theme: Theme, heightPx: number) =>
  css({
    width: trackHeaderWidthCss,
    height: heightPx,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    gap: getSpacingPx(SPACING.xs),
    padding: `0 ${getSpacingPx(SPACING.sm)} 0 ${getSpacingPx(SPACING.xl)}`,
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    background: theme.vars.palette.background.paper,
    color: theme.vars.palette.text.secondary,
    minWidth: 0
  });

const labelStyles = (theme: Theme) =>
  css({
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    "& .group": {
      fontSize: FONT_SIZE_SANS.caption,
      color: theme.vars.palette.text.disabled,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    "& .name": {
      fontSize: FONT_SIZE_SANS.label,
      fontWeight: FONT_WEIGHT.medium,
      color: theme.vars.palette.text.primary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    "&.is-off .name": { color: theme.vars.palette.text.disabled }
  });

interface LaneHeaderProps {
  track: TimelineTrack;
  lane: AutomationLane;
}

export const AutomationLaneHeader: React.FC<LaneHeaderProps> = memo(({ track, lane }) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const setTrackAutomation = useTimelineStore((s) => s.setTrackAutomation);
  const spec = useMemo(() => automationTargetSpec(track, lane.target, t), [track, lane.target, t]);
  const on = lane.enabled !== false;

  const toggle = useCallback(() => {
    setTrackAutomation(
      track.id,
      (track.automation ?? []).map((l) => (l.id === lane.id ? { ...l, enabled: !on } : l))
    );
  }, [setTrackAutomation, track.id, track.automation, lane.id, on]);

  const remove = useCallback(() => {
    setTrackAutomation(
      track.id,
      (track.automation ?? []).filter((l) => l.id !== lane.id)
    );
  }, [setTrackAutomation, track.id, track.automation, lane.id]);

  return (
    <div css={rowStyles(theme, AUTOMATION_LANE_HEIGHT_PX)} data-testid={`automation-lane-header-${lane.id}`}>
      <div css={labelStyles(theme)} className={on && spec ? "" : "is-off"}>
        <span className="group">{spec?.group ?? t("timelineAutomation.missingTarget")}</span>
        <span className="name">{spec?.label ?? automationTargetKey(lane.target)}</span>
      </div>
      <ToolbarIconButton
        icon={<PowerSettingsNewIcon />}
        size="small"
        active={on}
        disabled={track.locked}
        tooltip={on ? t("timelineAutomation.turnOff") : t("timelineAutomation.turnOn")}
        ariaLabel={on ? t("timelineAutomation.turnOff") : t("timelineAutomation.turnOn")}
        onClick={toggle}
      />
      <ToolbarIconButton
        icon={<CloseIcon />}
        size="small"
        disabled={track.locked}
        tooltip={t("timelineAutomation.removeLane")}
        ariaLabel={t("timelineAutomation.removeLane")}
        onClick={remove}
      />
    </div>
  );
});

AutomationLaneHeader.displayName = "AutomationLaneHeader";

interface FooterProps {
  track: TimelineTrack;
}

/** The row under a track's lanes that adds one for a picked control. */
export const AutomationAddLaneHeader: React.FC<FooterProps> = memo(({ track }) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const setTrackAutomation = useTimelineStore((s) => s.setTrackAutomation);
  const options = useMemo(() => {
    const used = new Set((track.automation ?? []).map((lane) => automationTargetKey(lane.target)));
    return automationTargetSpecs(track, t).filter((spec) => !used.has(spec.key));
  }, [track, t]);

  const add = useCallback(
    (_event: React.SyntheticEvent, spec: AutomationTargetSpec | null) => {
      if (!spec) return;
      setTrackAutomation(track.id, [...(track.automation ?? []), createAutomationLane(spec.target)]);
    },
    [setTrackAutomation, track.id, track.automation]
  );

  return (
    <div css={rowStyles(theme, AUTOMATION_FOOTER_HEIGHT_PX)} data-testid={`automation-add-${track.id}`}>
      <Autocomplete<AutomationTargetSpec>
        compact
        value={null}
        options={options}
        groupBy={(spec) => spec.group}
        getOptionLabel={(spec) => spec.label}
        isOptionEqualToValue={(a, b) => a.key === b.key}
        onChange={add}
        disabled={track.locked || options.length === 0}
        blurOnSelect
        clearOnBlur
        placeholder={t("timelineAutomation.addLane")}
        aria-label={t("timelineAutomation.addLane")}
        sx={{ flex: 1, minWidth: 0 }}
      />
    </div>
  );
});

AutomationAddLaneHeader.displayName = "AutomationAddLaneHeader";
