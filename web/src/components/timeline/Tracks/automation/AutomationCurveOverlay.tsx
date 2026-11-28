/**
 * AutomationCurveOverlay — the shown parameter's curve on a track's main
 * lane (contract AU3). It resolves the parameter, its lane and its color and
 * hands them to the shared lane view.
 */

import React, { memo, useMemo } from "react";
import { automationTargetKey, findAutomationLane, type AutomationLane, type TimelineTrack } from "@nodetool-ai/timeline";
import { useTranslation } from "react-i18next";

import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";
import { AutomationLaneView } from "./AutomationLaneView";
import { shownAutomationKey } from "./automationLayout";
import { automationRoleOf, automationTargetSpecs } from "./automationTargets";

interface Props {
  track: TimelineTrack;
  widthPx: number;
  heightPx: number;
}

export const AutomationCurveOverlay: React.FC<Props> = memo(({ track, widthPx, heightPx }) => {
  const { t } = useTranslation();
  const storedKey = useTimelineUIStore((s) => s.automationShownParams[track.id]);
  // The track's clip spans as one string: a clip edit on another track, or a
  // store change that leaves the clips alone, does not re-render the curve.
  const spanSignature = useTimelineStore(
    useMemo(() => {
      let seen: readonly unknown[] | null = null;
      let signature = "";
      return (s) => {
        if (s.clips !== seen) {
          seen = s.clips;
          signature = s.clips
            .filter((clip) => clip.trackId === track.id)
            .map((clip) => `${clip.startMs}:${clip.durationMs}`)
            .join(";");
        }
        return signature;
      };
    }, [track.id])
  );
  const clips = useMemo(
    () =>
      spanSignature === ""
        ? []
        : spanSignature.split(";").map((span) => {
            const [startMs, durationMs] = span.split(":").map(Number);
            return { startMs, durationMs };
          }),
    [spanSignature]
  );
  const specs = useMemo(() => automationTargetSpecs(track, t), [track, t]);
  const validKeys = useMemo(() => new Set(specs.map((s) => s.key)), [specs]);
  const key = shownAutomationKey(track, storedKey, validKeys);
  const spec = specs.find((s) => s.key === key);
  if (!spec) return null;
  return (
    <AutomationLaneView
      // A new parameter starts with no point selected and no menu open.
      key={spec.key}      track={track}
      lane={findAutomationLane(track, spec.target)}
      target={spec.target}
      widthPx={widthPx}
      heightPx={heightPx}
      variant="overlay"
      colorRole={automationRoleOf(specs, spec.target)}
      clips={clips}
    />
  );
});

AutomationCurveOverlay.displayName = "AutomationCurveOverlay";

interface SubLaneProps {
  track: TimelineTrack;
  lane: AutomationLane;
  widthPx: number;
}

/** A sub-lane under the track: the lane view in the parameter's color. */
export const AutomationSubLane: React.FC<SubLaneProps> = memo(({ track, lane, widthPx }) => {
  const { t } = useTranslation();
  const specs = useMemo(() => automationTargetSpecs(track, t), [track, t]);
  return (
    <AutomationLaneView
      key={automationTargetKey(lane.target)}
      track={track}
      lane={lane}
      widthPx={widthPx}
      colorRole={automationRoleOf(specs, lane.target)}
    />
  );
});

AutomationSubLane.displayName = "AutomationSubLane";
