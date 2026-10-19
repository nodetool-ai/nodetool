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

import { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
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
import ShotStatusPill, {
  isShotGenerating
} from "../../storyboard/ShotStatusPill";
import ErrorBanner from "../../support/ErrorBanner";
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
import {
  InspectorCard,
  InspectorDivider,
  InspectorSectionTitle
} from "../Inspector/InspectorPrimitives";
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

const useSelectedClipId = (): string | null =>
  useTimelineUIStore((state) =>
    state.selectedClipIds.size === 1 ? [...state.selectedClipIds][0] : null
  );

/**
 * Whether the one selected clip is a shot clip. A boolean, so a caller that
 * only needs the answer does not re-render on every edit of that clip.
 */
export const useHasSelectedShotClip = (): boolean => {
  const clipId = useSelectedClipId();
  return useTimelineStore((state) => {
    const clip = clipId ? findClipById(state.clips, clipId) : undefined;
    return clip !== undefined && isShotClip(clip);
  });
};

/** The one selected clip, when it is a shot clip. */
export const useSelectedShotClip = (): TimelineClip | null => {
  const clipId = useSelectedClipId();
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
  const { t } = useTranslation();
  const timeline = useTimelineStoreApi();
  const history = useTimelineHistoryBatch();
  const link = useClipStoryboardLink(boardId, shot.id);
  const jobError = useStoryboardGenerationStore((state) => {
    const job = state.shotJobs[shot.id];
    return job?.status === "failed" ? (job.errorMessage ?? null) : null;
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
      <FlexColumn gap={SPACING.none} sx={bodySx}>
        <InspectorCard>
          <FlexRow align="center" gap={SPACING.sm}>
            <Caption color="secondary">{shotNumber}</Caption>
            <ShotStatusPill shot={shot} />
          </FlexRow>
          <Text weight={500}>
            {shot.slug ?? t("batch2_28.panel.untitledShot")}
          </Text>
          <FlexRow gap={SPACING.sm} wrap>
            <EditorButton
              size="small"
              startIcon={<OpenInNewOutlinedIcon />}
              onClick={link?.open}
              disabled={!link}
              tooltip={t("batch2_28.panel.openTooltip")}
            >
              {t("batch2_28.panel.openOnBoard")}
            </EditorButton>
            <EditorButton
              size="small"
              startIcon={<LinkOffOutlinedIcon />}
              onClick={handleUnlink}
              disabled={clip.locked}
              tooltip={t("batch2_28.panel.unlinkTooltip")}
            >
              {t("batch2_28.panel.unlink")}
            </EditorButton>
          </FlexRow>
        </InspectorCard>

        <CollapsibleSection
          title={
            <InspectorSectionTitle
              title={t("batch2_28.panel.takes")}
              icon={<MovieCreationOutlinedIcon />}
            />
          }
          open={takesOpen}
          onToggle={setTakesOpen}
        >
          <FlexColumn gap={SPACING.sm} sx={{ py: SPACING.sm }}>
            {(shot.clip_versions?.length ?? 0) === 0 && !shot.clip && (
              <Caption color="secondary">
                {t("batch2_28.panel.noTakes")}
              </Caption>
            )}
            <ShotTakesGallery boardId={boardId} shot={shot} />
            <EditorButton
              fullWidth
              variant="contained"
              onClick={openRender}
              disabled={generating}
              data-testid="timeline-shot-new-take"
              tooltip={
                needsStill
                  ? t("batch2_28.panel.renderStillFirst")
                  : t("batch2_28.panel.renderAnotherTake")
              }
            >
              {generating
                ? t("batch2_28.panel.rendering")
                : needsStill
                  ? t("batch2_28.panel.renderStill")
                  : t("batch2_28.panel.newTake")}
            </EditorButton>
            {clip.locked && (
              <Caption color="secondary">
                {t("batch2_28.panel.lockedClipHint")}
              </Caption>
            )}
            {jobError && (
              <ErrorBanner
                report={{
                  source: "job-failure",
                  summary: t("batch2_28.panel.generationFailed"),
                  errorText: jobError
                }}
              >
                {jobError}
              </ErrorBanner>
            )}
          </FlexColumn>
        </CollapsibleSection>

        <InspectorDivider />

        <CollapsibleSection
          title={
            <InspectorSectionTitle
              title={t("batch2_28.panel.shot")}
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
          <>
            <InspectorDivider />
            <CollapsibleSection
              title={
                <InspectorSectionTitle
                  title={t("batch2_28.panel.derivedShot")}
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
          </>
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
  const { t } = useTranslation();
  const clip = useSelectedShotClip();
  const boardId = clip?.storyboardBoardId ?? null;
  const shotId = clip?.storyboardShotId ?? null;
  const boardLoaded = useStoryboardStore((state) =>
    boardId ? !!state.boards[boardId] : false
  );
  const shot = useStoryboardStore((state) =>
    boardId && shotId
      ? state.boards[boardId]?.shots.find(
          (candidate) => candidate.id === shotId
        )
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
        title={t("batch2_28.panel.noShotSelectedTitle")}
        description={t("batch2_28.panel.noShotSelectedDescription")}
      />
    );
  }
  if (!boardLoaded && isError) {
    return (
      <EmptyState
        variant="error"
        size="small"
        title={t("batch2_28.panel.storyboardUnavailableTitle")}
        description={t("batch2_28.panel.storyboardUnavailableDescription")}
      />
    );
  }
  if (!boardLoaded) {
    return (
      <FlexColumn align="center" gap={SPACING.sm} sx={bodySx}>
        <LoadingSpinner size="small" />
        <Caption color="secondary">
          {t("batch2_28.panel.openingStoryboard")}
        </Caption>
      </FlexColumn>
    );
  }
  if (!shot) {
    return (
      <EmptyState
        variant="empty"
        size="small"
        title={t("batch2_28.panel.shotNotFoundTitle")}
        description={t("batch2_28.panel.shotNotFoundDescription")}
      />
    );
  }
  return <ShotContent clip={clip} boardId={boardId} shot={shot} />;
};

export const TimelineShotPanel = memo(TimelineShotPanelInner);
TimelineShotPanel.displayName = "TimelineShotPanel";

export default TimelineShotPanel;
