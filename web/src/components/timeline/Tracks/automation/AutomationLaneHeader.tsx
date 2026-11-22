/** @jsxImportSource @emotion/react */
/**
 * The header-column side of a track's automation: one row per lane naming
 * the control it drives, with its on switch and remove button, and a last row
 * that picks a control for a new lane.
 */

import React, { memo, useCallback, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import CloseIcon from "@mui/icons-material/CloseOutlined";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import {
  automationTargetKey,
  createAutomationLane,
  type AutomationLane,
  type TimelineTrack
} from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";
import { Autocomplete, ToolbarIconButton } from "../../../ui_primitives";
import {
  AUTOMATION_FOOTER_HEIGHT_PX,
  AUTOMATION_LANE_HEIGHT_PX,
  shownAutomationKey
} from "./automationLayout";
import {
  automationNormToValue,
  automationRoleOf,
  automationTargetSpecs,
  automationValueToNorm,
  type AutomationTargetSpec
} from "./automationTargets";
import { AutomationMenuButton, type AutomationMenuEntry } from "./AutomationMenuButton";
import { AutomationValueReadout } from "./AutomationValueReadout";
import { automationRowStyles } from "./AutomationHeaderRow";

interface LaneHeaderProps {
  track: TimelineTrack;
  lane: AutomationLane;
}

/**
 * A sub-lane's header: the parameter select and the value at the playhead,
 * with the lane's on switch and remove button. The mode is the track's, so it
 * has no mode select and no disclosure.
 */
export const AutomationLaneHeader: React.FC<LaneHeaderProps> = memo(({ track, lane }) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const setTrackAutomation = useTimelineStore((s) => s.setTrackAutomation);
  const specs = useMemo(() => automationTargetSpecs(track, t), [track, t]);
  const key = automationTargetKey(lane.target);
  const spec = specs.find((s) => s.key === key);
  const on = lane.enabled !== false;
  const storedKey = useTimelineUIStore((s) => s.automationShownParams[track.id]);
  const taken = useMemo(() => {
    // The shown parameter lives on the main lane, so a sub-lane cannot take it.
    const keys = new Set((track.automation ?? []).map((l) => automationTargetKey(l.target)));
    keys.add(shownAutomationKey(track, storedKey, new Set(specs.map((s) => s.key))));
    return keys;
  }, [track, storedKey, specs]);
  const withPoints = useMemo(
    () =>
      new Set(
        (track.automation ?? []).filter((l) => l.points.length > 0).map((l) => automationTargetKey(l.target))
      ),
    [track.automation]
  );
  const entries = useMemo<AutomationMenuEntry[]>(
    () =>
      specs.map((s) => ({
        key: s.key,
        label: s.label,
        group: s.group,
        dot: withPoints.has(s.key),
        // A parameter that has a lane stays where it is.
        disabled: s.key !== key && taken.has(s.key)
      })),
    [specs, taken, withPoints, key]
  );
  const role = spec ? automationRoleOf(specs, spec.target) : "primary";
  const color = on ? theme.vars.palette[role].main : theme.vars.palette.text.disabled;

  const retarget = useCallback(
    (nextKey: string) => {
      const next = specs.find((s) => s.key === nextKey);
      if (!next || taken.has(nextKey)) return;
      // The curve keeps its shape over the new parameter's range. Without the
      // old control, the values stay and are held inside the new range.
      const points = spec
        ? lane.points.map((p) => ({
            ...p,
            value: automationNormToValue(next, automationValueToNorm(spec, p.value))
          }))
        : lane.points.map((p) => ({ ...p, value: Math.min(next.max, Math.max(next.min, p.value)) }));
      setTrackAutomation(
        track.id,
        (track.automation ?? []).map((l) => (l.id === lane.id ? { ...l, target: next.target, points } : l))
      );
    },
    [specs, taken, spec, lane.points, lane.id, setTrackAutomation, track.id, track.automation]
  );

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
    <div
      css={automationRowStyles(theme, AUTOMATION_LANE_HEIGHT_PX)}
      data-testid={`automation-lane-header-${lane.id}`}
    >
      <AutomationMenuButton
        label={spec?.label ?? t("timelineAutomation.missingTarget")}
        value={key}
        entries={entries}
        onSelect={retarget}
        tone={{ kind: "text", color }}
        ariaLabel={t("timelineAutomation.parameter")}
        testId={`automation-lane-param-${lane.id}`}
        disabled={track.locked}
        dot={lane.points.length > 0}
        grow
      />
      {spec && <AutomationValueReadout track={track} spec={spec} color={color} />}
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
  const storedKey = useTimelineUIStore((s) => s.automationShownParams[track.id]);
  const options = useMemo(() => {
    // The shown parameter lives on the main lane, so it is not added here.
    const used = new Set((track.automation ?? []).map((lane) => automationTargetKey(lane.target)));
    const specs = automationTargetSpecs(track, t);
    used.add(shownAutomationKey(track, storedKey, new Set(specs.map((s) => s.key))));
    return specs.filter((spec) => !used.has(spec.key));
  }, [track, t, storedKey]);

  const add = useCallback(
    (_event: React.SyntheticEvent, spec: AutomationTargetSpec | null) => {
      if (!spec) return;
      setTrackAutomation(track.id, [...(track.automation ?? []), createAutomationLane(spec.target)]);
    },
    [setTrackAutomation, track.id, track.automation]
  );

  return (
    <div css={automationRowStyles(theme, AUTOMATION_FOOTER_HEIGHT_PX)} data-testid={`automation-add-${track.id}`}>
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
