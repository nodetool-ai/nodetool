/**
 * Inspector panel for a group clip (D4).
 *
 * A group draws nothing: it is a transform parent its children name with
 * `parentId`, so the imported-clip panel's Media and Speed rows have nothing to
 * say about it. This panel shows what a group actually owns — its name, the
 * window it imposes on its children, how many clips hang off it — and keeps the
 * sections that compose down the tree: animations, and the transform, blend and
 * effects the children inherit.
 */

import React, { memo, useCallback } from "react";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import type { TimelineClip } from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import {
  Button,
  Caption,
  CollapsibleSection,
  FlexColumn,
  SPACING
} from "../../ui_primitives";
import { usePersistedFold } from "./usePersistedFold";
import {
  InspectorDivider,
  InspectorPillInput,
  InspectorRow,
  InspectorSectionTitle,
  InspectorStaticValue,
  InspectorToggleRow
} from "./InspectorPrimitives";
import { formatTimecode, parseSeconds, parseTimecode } from "./InspectorPrimitives.helpers";
import { ClipAdjustments } from "./ClipAdjustments";
import { ClipAnimations } from "./ClipAnimations";

const SCRUB_DURATION = { step: 0.02, min: 0.01 };

interface ClipGroupPanelProps {
  clip: TimelineClip;
  /** Releases the group's children and deletes the group itself. */
  onUngroup: () => void;
}

export const ClipGroupPanel: React.FC<ClipGroupPanelProps> = memo(
  ({ clip, onUngroup }) => {
    const [timingOpen, setTimingOpen] = usePersistedFold("timing");
    const [groupOpen, setGroupOpen] = usePersistedFold("group", true);
    const patchClip = useTimelineStore((s) => s.patchClip);
    const fps = useTimelineStore((s) => s.fps);
    // A count, not the clips — the panel re-renders only when the membership
    // changes, not when a child moves.
    const childCount = useTimelineStore(
      (s) => s.clips.filter((candidate) => candidate.parentId === clip.id).length
    );

    const handleName = useCallback(
      (raw: string) => {
        const name = raw.trim();
        if (name === "") return;
        patchClip(clip.id, { name });
      },
      [clip.id, patchClip]
    );

    const handleStart = useCallback(
      (raw: string) => {
        const ms = parseTimecode(raw, fps);
        if (ms == null) return;
        patchClip(clip.id, { startMs: Math.max(0, ms) });
      },
      [clip.id, fps, patchClip]
    );

    const handleDuration = useCallback(
      (raw: string) => {
        const ms = parseSeconds(raw);
        if (ms == null || ms < 1) return;
        patchClip(clip.id, { durationMs: ms });
      },
      [clip.id, patchClip]
    );

    const handleHidden = useCallback(
      (hidden: boolean) => patchClip(clip.id, { hidden }),
      [clip.id, patchClip]
    );

    return (
      <>
        <CollapsibleSection
          title={
            <InspectorSectionTitle
              title="Group"
              icon={<FolderOutlinedIcon />}
            />
          }
          open={groupOpen}
          onToggle={setGroupOpen}
          unmountOnExit
        >
          <FlexColumn gap={SPACING.xs} sx={{ py: SPACING.xs }}>
            <InspectorRow label="Name">
              <InspectorPillInput
                value={clip.name}
                minWidth={140}
                onCommit={handleName}
                ariaLabel="Group name"
              />
            </InspectorRow>
            <InspectorRow label="Children">
              <InspectorStaticValue value={String(childCount)} />
            </InspectorRow>
            <Caption color="muted">
              A group draws nothing. Its transform, opacity and window apply to
              every clip that names it as a parent; each child keeps its own
              track, so layer order is unchanged.
            </Caption>
            <Button size="small" variant="outlined" onClick={onUngroup}>
              Ungroup
            </Button>
          </FlexColumn>
        </CollapsibleSection>

        <InspectorDivider />

        <CollapsibleSection
          title={
            <InspectorSectionTitle
              title="Timing"
              icon={<ScheduleOutlinedIcon />}
            />
          }
          open={timingOpen}
          onToggle={setTimingOpen}
          unmountOnExit
        >
          <FlexColumn gap={SPACING.xs} sx={{ py: SPACING.xs }}>
            <InspectorRow label="Start">
              <InspectorPillInput
                value={formatTimecode(clip.startMs, fps)}
                minWidth={112}
                onCommit={handleStart}
                ariaLabel="Start timecode"
              />
            </InspectorRow>
            <InspectorRow label="Duration">
              <InspectorPillInput
                value={(clip.durationMs / 1000).toFixed(2)}
                unit="s"
                scrub={SCRUB_DURATION}
                onCommit={handleDuration}
                ariaLabel="Duration in seconds"
              />
            </InspectorRow>
            <InspectorToggleRow
              label="Hidden"
              checked={!!clip.hidden}
              onChange={handleHidden}
            />
            <Caption color="muted">
              Trimming the group pulls its children inside the window that
              leaves.
            </Caption>
          </FlexColumn>
        </CollapsibleSection>

        <ClipAdjustments clip={clip} />

        <ClipAnimations clip={clip} />
      </>
    );
  }
);

ClipGroupPanel.displayName = "ClipGroupPanel";
