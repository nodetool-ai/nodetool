/**
 * TimelineShotPanel
 *
 * The Shot tab of the timeline side panel, offered while the one selected clip
 * is linked to a storyboard shot. It works on the shot itself, on its board:
 *
 *   - Takes: every rendered take of the shot. Picking one makes it the shot's
 *     clip, and the cut follows (`useLinkedShotTakes`). `New take` renders
 *     another with a model picked in the same dialog the board uses.
 *   - Shot: the shot form (`TimelineShotForm`), the fields a take renders from.
 *   - Derived shot: a new shot referenced on frames of this clip
 *     (`DerivedShotSection`), on a new track above it.
 *
 * `Unlink` takes the clip (and its linked audio twin) off the shot; its
 * footage stays as it is.
 */

import React, { memo, useCallback, useState } from "react";
import type { TimelineClip } from "@nodetool-ai/timeline";
import { shotRenderMode } from "@nodetool-ai/protocol";
import type { Shot } from "@nodetool-ai/protocol";
import MovieCreationOutlinedIcon from "@mui/icons-material/MovieCreationOutlined";
import LinkOffOutlinedIcon from "@mui/icons-material/LinkOffOutlined";
import OpenInNewOutlinedIcon from "@mui/icons-material/OpenInNewOutlined";
import CallSplitOutlinedIcon from "@mui/icons-material/CallSplitOutlined";
import EditNoteOutlinedIcon from "@mui/icons-material/EditNoteOutlined";

import {
  useTimelineStore,
  useTimelineStoreApi
} from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { findClipById } from "../../../stores/timeline/clipLookup";
import { useTimelineHistoryBatch } from "../../../stores/timeline/useTimelineHistoryBatch";
import { trpc } from "../../../trpc/client";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useStoryboardGenerationStore } from "../../../stores/storyboard/StoryboardGenerationStore";
import { useClipStoryboardLink } from "../../../hooks/timeline/useClipStoryboardLink";
import ShotTakesGallery from "../../storyboard/ShotTakesGallery";
import ShotRenderDialog, {
  type ShotRenderStep
} from "../../storyboard/ShotRenderDialog";
import ShotStatusPill, { isShotGenerating } from "../../storyboard/ShotStatusPill";
import {
  Caption,
  CollapsibleSection,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  ScrollArea,
  Text,
  SPACING
} from "../../ui_primitives";
import { InspectorSectionTitle } from "../Inspector/InspectorPrimitives";
import { usePersistedFold } from "../Inspector/usePersistedFold";
import TimelineShotForm from "./TimelineShotForm";
import DerivedShotSection from "./DerivedShotSection";

/** Whether a clip plays a storyboard shot's take. */
export const isShotClip = (
  clip: Pick<
    TimelineClip,
    "storyboardBoardId" | "storyboardShotId" | "scriptLineId" | "mediaType"
  >
): boolean =>
  !!clip.storyboardBoardId &&
  !!clip.storyboardShotId &&
  !clip.scriptLineId &&
  (clip.mediaType === "video" || clip.mediaType === "audio");

/** The one selected clip, when it is a shot clip. */
export const useSelectedShotClip = (): TimelineClip | null => {
  const clipId = useTimelineUIStore((state) =>
    state.selectedClipIds.size === 1 ? [...state.selectedClipIds][0] : null
  );
  const clip = useTimelineStore((state) =>
    clipId ? findClipById(state.clips, clipId) : undefined
  );
  return clip && isShotClip(clip) ? clip : null;
};

const panelSx = {
  height: "100%",
  minHeight: 0
} as const;

const bodySx = {
  px: SPACING.lg,
  py: SPACING.md
} as const;

interface ShotContentProps {
  clip: TimelineClip;
  boardId: string;
  shot: Shot;
}

const ShotContent = memo(({ clip, boardId, shot }: ShotContentProps) => {
  const timeline = useTimelineStoreApi();
  const history = useTimelineHistoryBatch();
  const link = useClipStoryboardLink(boardId, shot.id);
  const jobError = useStoryboardGenerationStore((state) => {
    const job = state.shotJobs[shot.id];
    return job?.status === "failed" ? job.errorMessage ?? null : null;
  });
  const [takesOpen, setTakesOpen] = usePersistedFold("shot-takes", true);
  const [formOpen, setFormOpen] = usePersistedFold("shot-form", true);
  const [deriveOpen, setDeriveOpen] = usePersistedFold("shot-derive", false);
  const [renderStep, setRenderStep] = useState<ShotRenderStep | null>(null);

  const generating = isShotGenerating(shot);
  const needsStill = shotRenderMode(shot) === "keyframe" && !shot.keyframe;
  const shotNumber = `SH ${String(shot.index + 1).padStart(2, "0")}`;

  const handleUnlink = useCallback(() => {
    const partners = timeline
      .getState()
      .clips.filter(
        (candidate) =>
          candidate.id === clip.id ||
          (!!clip.linkId &&
            candidate.linkId === clip.linkId &&
            candidate.storyboardShotId === clip.storyboardShotId)
      );
    history.begin();
    try {
      for (const partner of partners) {
        timeline.getState().patchClip(partner.id, {
          storyboardBoardId: undefined,
          storyboardShotId: undefined
        });
        history.mark();
      }
    } finally {
      history.end();
    }
  }, [clip.id, clip.linkId, clip.storyboardShotId, history, timeline]);

  const openRender = useCallback(
    () => setRenderStep(needsStill ? "still" : "clip"),
    [needsStill]
  );
  const closeRender = useCallback(() => setRenderStep(null), []);

  return (
    <ScrollArea sx={panelSx}>
      <FlexColumn gap={SPACING.md} sx={bodySx}>
        <FlexColumn gap={SPACING.xs}>
          <FlexRow align="center" gap={SPACING.sm}>
            <Caption color="secondary">{shotNumber}</Caption>
            <ShotStatusPill shot={shot} />
          </FlexRow>
          <Text weight={500}>{shot.slug ?? "Untitled shot"}</Text>
          <FlexRow gap={SPACING.sm} wrap>
            <EditorButton
              size="small"
              startIcon={<OpenInNewOutlinedIcon />}
              onClick={link?.open}
              disabled={!link}
              title="Open this shot on its storyboard"
            >
              Open on board
            </EditorButton>
            <EditorButton
              size="small"
              startIcon={<LinkOffOutlinedIcon />}
              onClick={handleUnlink}
              disabled={clip.locked}
              title="Stop this clip following the shot. Its footage stays."
            >
              Unlink
            </EditorButton>
          </FlexRow>
        </FlexColumn>

        <CollapsibleSection
          title={
            <InspectorSectionTitle
              title="Takes"
              icon={<MovieCreationOutlinedIcon />}
            />
          }
          open={takesOpen}
          onToggle={setTakesOpen}
        >
          <FlexColumn gap={SPACING.sm} sx={{ py: SPACING.sm }}>
            {(shot.clip_versions?.length ?? 0) === 0 && !shot.clip && (
              <Caption color="secondary">No takes rendered yet.</Caption>
            )}
            <ShotTakesGallery boardId={boardId} shot={shot} />
            <EditorButton
              fullWidth
              variant="contained"
              onClick={openRender}
              disabled={generating}
              data-testid="timeline-shot-new-take"
              title={
                needsStill
                  ? "This shot animates a still. Render the still first."
                  : "Render another take of this shot"
              }
            >
              {generating
                ? "Rendering…"
                : needsStill
                  ? "Render still"
                  : "New take"}
            </EditorButton>
            {clip.locked && (
              <Caption color="secondary">
                This clip is locked, so it keeps its footage when the take
                changes.
              </Caption>
            )}
            {jobError && <Caption color="error">{jobError}</Caption>}
          </FlexColumn>
        </CollapsibleSection>

        <CollapsibleSection
          title={
            <InspectorSectionTitle
              title="Shot"
              icon={<EditNoteOutlinedIcon />}
            />
          }
          open={formOpen}
          onToggle={setFormOpen}
        >
          <FlexColumn sx={{ py: SPACING.sm }}>
            <TimelineShotForm boardId={boardId} shot={shot} />
          </FlexColumn>
        </CollapsibleSection>

        {clip.mediaType === "video" && clip.currentAssetId && (
          <CollapsibleSection
            title={
              <InspectorSectionTitle
                title="Derived shot"
                icon={<CallSplitOutlinedIcon />}
              />
            }
            open={deriveOpen}
            onToggle={setDeriveOpen}
          >
            <FlexColumn sx={{ py: SPACING.sm }}>
              <DerivedShotSection clipId={clip.id} />
            </FlexColumn>
          </CollapsibleSection>
        )}
      </FlexColumn>
      {renderStep && (
        <ShotRenderDialog
          boardId={boardId}
          shot={shot}
          step={renderStep}
          onClose={closeRender}
        />
      )}
    </ScrollArea>
  );
});
ShotContent.displayName = "ShotContent";

const TimelineShotPanelInner = () => {
  const clip = useSelectedShotClip();
  const boardId = clip?.storyboardBoardId ?? null;
  const shotId = clip?.storyboardShotId ?? null;
  const boardLoaded = useStoryboardStore((state) =>
    boardId ? !!state.boards[boardId] : false
  );
  const shot = useStoryboardStore((state) =>
    boardId && shotId
      ? state.boards[boardId]?.shots.find((candidate) => candidate.id === shotId)
      : undefined
  );
  const { isError } = trpc.storyboards.get.useQuery(
    { id: boardId ?? "" },
    { enabled: !!boardId && !boardLoaded, staleTime: 30_000, retry: false }
  );
  if (!clip || !boardId) {
    return (
      <EmptyState
        variant="empty"
        size="small"
        title="No shot selected"
        description="Select a clip linked to a storyboard shot."
      />
    );
  }
  if (!boardLoaded && isError) {
    return (
      <EmptyState
        variant="error"
        size="small"
        title="Storyboard unavailable"
        description="The storyboard this clip is linked to could not be opened."
      />
    );
  }
  if (!boardLoaded) {
    return (
      <FlexColumn align="center" gap={SPACING.sm} sx={bodySx}>
        <LoadingSpinner size="small" />
        <Caption color="secondary">Opening the storyboard…</Caption>
      </FlexColumn>
    );
  }
  if (!shot) {
    return (
      <EmptyState
        variant="empty"
        size="small"
        title="Shot not found"
        description="The shot this clip is linked to is no longer on its storyboard."
      />
    );
  }
  return <ShotContent clip={clip} boardId={boardId} shot={shot} />;
};

export const TimelineShotPanel = memo(TimelineShotPanelInner);
TimelineShotPanel.displayName = "TimelineShotPanel";

export default TimelineShotPanel;
