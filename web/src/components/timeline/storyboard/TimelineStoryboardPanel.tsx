/**
 * TimelineStoryboardPanel
 *
 * A storyboard's shots, beside the cut. Drag a shot onto a video track, or
 * press Enter on it to place it at the playhead. The clip it becomes is the
 * clip assembly would lay down for the shot (`shotClipPlacements`), stamped
 * with the board and shot, so it follows the shot's selected take from then
 * on and the board opens with the timeline (`TimelineLinkedBoards`).
 *
 * The panel starts on the first board the cut already links to. The open
 * board's live shots win over the server copy, as in useClipStoryboardLink.
 */

import { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Shot } from "@nodetool-ai/protocol";
import { shotClipPlacements, type ShotClipPlacement } from "@nodetool-ai/timeline";

import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useTimelineStoreApi } from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import { trpc } from "../../../trpc/client";
import { useStoryboards } from "../../../hooks/storyboard/useStoryboards";
import { useLinkedBoardIds } from "../../../hooks/timeline/useLinkedShotTakes";
import {
  Box,
  BORDER_RADIUS,
  Caption,
  EmptyState,
  FlexColumn,
  FlexRow,
  MOTION,
  ResponsiveImage,
  ScrollArea,
  SelectField,
  SPACING,
  TruncatedText
} from "../../ui_primitives";
import {
  serializeDragData,
  type StoryboardShotDragPayload
} from "../../../lib/dragdrop";
import { dropShotOnTrack } from "../dnd/shotToClipAdapter";

const shotNumber = (shot: Shot): string =>
  `SH ${String(shot.index + 1).padStart(2, "0")}`;

const formatSeconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

interface ShotTileProps {
  boardId: string;
  shot: Shot;
  placement: ShotClipPlacement | null;
  untitled: string;
}

const ShotTile = memo(({ boardId, shot, placement, untitled }: ShotTileProps) => {
  const { t } = useTranslation();
  const timeline = useTimelineStoreApi();
  const name = shot.slug ?? (shot.action.slice(0, 48) || untitled);
  const label = `${shotNumber(shot)} · ${name}`;
  const payload = useMemo<StoryboardShotDragPayload | null>(
    () =>
      placement
        ? { boardId, shotId: shot.id, name: shot.slug ?? `Shot ${shot.index + 1}`, placement }
        : null,
    [boardId, placement, shot.id, shot.index, shot.slug]
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!payload) {
        e.preventDefault();
        return;
      }
      serializeDragData({ type: "storyboard-shot", payload }, e.dataTransfer);
      e.dataTransfer.effectAllowed = "copy";
    },
    [payload]
  );

  // The keyboard path for the drag: the first unlocked video track, at the
  // playhead, or a new video track when the cut has none.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Enter" || !payload) {
        return;
      }
      e.preventDefault();
      const state = timeline.getState();
      const existing = state.tracks.find(
        (track) => track.type === "video" && !track.locked
      );
      const trackId = existing
        ? existing.id
        : (): string => {
            timeline.getState().addTrack("video");
            return timeline.getState().tracks.slice(-1)[0]?.id ?? "";
          };
      dropShotOnTrack(
        timeline,
        payload,
        trackId,
        Math.round(useTimelinePlaybackStore.getState().getTimeMs()),
        useTimelineUIStore.getState().dropMode
      );
    },
    [payload, timeline]
  );

  return (
    <Box
      role="listitem"
      tabIndex={0}
      draggable={payload !== null}
      onDragStart={handleDragStart}
      onKeyDown={handleKeyDown}
      aria-disabled={payload === null}
      aria-label={
        payload
          ? t("batch2_29.storyboardPanel.shotHint", { shot: label })
          : t("batch2_29.storyboardPanel.shotUnrendered", { shot: label })
      }
      data-testid={`storyboard-panel-shot-${shot.id}`}
      sx={{
        borderRadius: BORDER_RADIUS.md,
        border: 1,
        borderColor: "divider",
        overflow: "hidden",
        cursor: payload ? "grab" : "default",
        opacity: payload ? 1 : 0.5,
        transition: MOTION.border,
        "&:hover": payload ? { borderColor: "primary.main" } : undefined,
        "&:focus-visible": {
          outline: 2,
          outlineColor: "primary.main",
          outlineOffset: 2
        }
      }}
    >
      <Box sx={{ aspectRatio: "16 / 9", bgcolor: "action.hover" }}>
        {shot.keyframe ? (
          <ResponsiveImage
            locator={shot.keyframe}
            preferThumbnail
            loading="lazy"
            alt=""
            fit="cover"
            sx={{ height: "100%" }}
            draggable={false}
          />
        ) : null}
      </Box>
      <FlexRow
        gap={SPACING.sm}
        align="center"
        justify="space-between"
        sx={{ px: SPACING.sm, py: SPACING.xs }}
      >
        <TruncatedText variant="body2">{label}</TruncatedText>
        <Caption color="secondary" sx={{ flexShrink: 0 }}>
          {placement
            ? formatSeconds(placement.durationMs)
            : t("batch2_29.storyboardPanel.unrendered")}
        </Caption>
      </FlexRow>
    </Box>
  );
});
ShotTile.displayName = "ShotTile";

const TimelineStoryboardPanelInner = () => {
  const { t } = useTranslation();
  const linkedBoardIds = useLinkedBoardIds();
  const { data: boards, isLoading: boardsLoading } = useStoryboards();
  const [pickedBoardId, setPickedBoardId] = useState<string | null>(null);
  const boardId = pickedBoardId ?? linkedBoardIds[0] ?? "";

  const openShots = useStoryboardStore((state) =>
    boardId ? state.boards[boardId]?.shots : undefined
  );
  const { data: board, isLoading: boardLoading } =
    trpc.storyboards.get.useQuery(
      { id: boardId },
      { enabled: boardId !== "" && !openShots, staleTime: 30_000, retry: false }
    );
  // SAFETY: the wire document's `shots` is the passthrough zod mirror of
  // `Shot`, as in useClipStoryboardLink.
  const shots = openShots ?? (board?.document.shots as Shot[] | undefined);
  const ordered = useMemo(
    () => [...(shots ?? [])].sort((a, b) => a.index - b.index),
    [shots]
  );
  const placements = useMemo(() => shotClipPlacements(ordered), [ordered]);

  const boardOptions = useMemo(
    () => [
      ...(boardId === ""
        ? [{ value: "", label: t("batch2_28.link.chooseStoryboard") }]
        : []),
      ...(boards ?? []).map((item) => ({
        value: item.id,
        label: item.name || t("batch2_28.link.untitledStoryboard")
      }))
    ],
    [boardId, boards, t]
  );

  if (!boardsLoading && (boards?.length ?? 0) === 0 && boardId === "") {
    return (
      <EmptyState
        size="small"
        title={t("batch2_29.storyboardPanel.noBoardsTitle")}
        description={t("batch2_29.storyboardPanel.noBoardsDescription")}
      />
    );
  }

  const untitled = t("batch2_28.link.untitledShot");
  return (
    <FlexColumn fullHeight sx={{ minHeight: 0 }} data-testid="timeline-storyboard-panel">
      <FlexColumn gap={SPACING.xs} sx={{ p: SPACING.sm }}>
        <SelectField
          label={t("batch2_28.link.storyboardLabel")}
          hideLabel
          size="small"
          value={boardId}
          onChange={setPickedBoardId}
          options={boardOptions}
          disabled={boardsLoading}
        />
        {ordered.length > 0 ? (
          <Caption color="secondary">
            {t("batch2_29.storyboardPanel.hint")}
          </Caption>
        ) : null}
      </FlexColumn>
      {boardId === "" ? null : ordered.length === 0 ? (
        <Caption color="secondary" sx={{ px: SPACING.sm }}>
          {boardLoading
            ? t("batch2_28.link.loadingStoryboards")
            : t("batch2_29.storyboardPanel.noShots")}
        </Caption>
      ) : (
        <ScrollArea thin sx={{ flex: 1, minHeight: 0, px: SPACING.sm, pb: SPACING.sm }}>
          <Box
            role="list"
            aria-label={t("batch2_29.storyboardPanel.listLabel")}
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: SPACING.sm
            }}
          >
            {ordered.map((shot) => (
              <ShotTile
                key={shot.id}
                boardId={boardId}
                shot={shot}
                placement={placements.get(shot.id) ?? null}
                untitled={untitled}
              />
            ))}
          </Box>
        </ScrollArea>
      )}
    </FlexColumn>
  );
};

export const TimelineStoryboardPanel = memo(TimelineStoryboardPanelInner);
TimelineStoryboardPanel.displayName = "TimelineStoryboardPanel";

export default TimelineStoryboardPanel;
