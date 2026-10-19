/**
 * LinkShotDialog
 *
 * Links a video clip, and the audio twin that shares its `linkId`, to a shot
 * on a storyboard. The clip keeps its footage; from then on it follows the
 * shot's selected take, and the Shot tab works on that shot.
 */

import { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Shot } from "@nodetool-ai/protocol";

import {
  Caption,
  Dialog,
  FlexColumn,
  SelectField,
  SPACING
} from "../../ui_primitives";
import { trpc } from "../../../trpc/client";
import { useStoryboards } from "../../../hooks/storyboard/useStoryboards";
import { useTimelineStoreApi } from "../../../stores/timeline/TimelineStore";
import { useTimelineHistoryBatch } from "../../../stores/timeline/useTimelineHistoryBatch";

interface LinkShotDialogProps {
  clipId: string;
  onClose: () => void;
}

const shotLabel = (shot: Shot, untitled: string): string =>
  `SH ${String(shot.index + 1).padStart(2, "0")} · ${
    shot.slug ?? (shot.action.slice(0, 48) || untitled)
  }`;

const LinkShotDialogInner = ({ clipId, onClose }: LinkShotDialogProps) => {
  const { t } = useTranslation();
  const timeline = useTimelineStoreApi();
  const history = useTimelineHistoryBatch();
  const { data: boards, isLoading: boardsLoading } = useStoryboards();
  const [boardId, setBoardId] = useState("");
  const [shotId, setShotId] = useState("");
  const { data: board, isLoading: boardLoading } =
    trpc.storyboards.get.useQuery(
      { id: boardId },
      { enabled: boardId !== "", staleTime: 30_000, retry: false }
    );

  const boardOptions = useMemo(
    () => [
      {
        value: "",
        label: boardsLoading
          ? t("batch2_28.link.loadingStoryboards")
          : (boards?.length ?? 0) === 0
            ? t("batch2_28.link.noStoryboards")
            : t("batch2_28.link.chooseStoryboard")
      },
      ...(boards ?? []).map((item) => ({
        value: item.id,
        label: item.name || t("batch2_28.link.untitledStoryboard")
      }))
    ],
    [boards, boardsLoading, t]
  );
  const shotOptions = useMemo(() => {
    // SAFETY: the wire document's `shots` is the passthrough zod mirror of
    // `Shot`, as in useClipStoryboardLink.
    const shots = (board?.document.shots as Shot[] | undefined) ?? [];
    return [
      {
        value: "",
        label: boardId
          ? t("batch2_28.link.chooseShot")
          : t("batch2_28.link.chooseStoryboardFirst")
      },
      ...[...shots]
        .sort((a, b) => a.index - b.index)
        .map((shot) => ({
          value: shot.id,
          label: shotLabel(shot, t("batch2_28.link.untitledShot"))
        }))
    ];
  }, [board, boardId, t]);

  const handleBoardChange = useCallback((value: string) => {
    setBoardId(value);
    setShotId("");
  }, []);

  const handleConfirm = useCallback(() => {
    if (!boardId || !shotId) {
      return;
    }
    const clips = timeline.getState().clips;
    const clip = clips.find((candidate) => candidate.id === clipId);
    if (!clip) {
      onClose();
      return;
    }
    const twins = clips.filter(
      (candidate) =>
        candidate.id === clip.id ||
        (!!clip.linkId &&
          candidate.linkId === clip.linkId &&
          candidate.mediaType === "audio" &&
          !candidate.scriptLineId)
    );
    history.begin();
    try {
      for (const twin of twins) {
        timeline.getState().patchClip(twin.id, {
          storyboardBoardId: boardId,
          storyboardShotId: shotId
        });
        history.mark();
      }
    } finally {
      history.end();
    }
    onClose();
  }, [boardId, clipId, history, onClose, shotId, timeline]);

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("batch2_28.link.title")}
      onConfirm={handleConfirm}
      confirmText={t("batch2_28.link.action")}
      confirmDisabled={!boardId || !shotId}
    >
      <FlexColumn gap={SPACING.lg}>
        <Caption color="secondary">{t("batch2_28.link.description")}</Caption>
        <SelectField
          label={t("batch2_28.link.storyboardLabel")}
          value={boardId}
          onChange={handleBoardChange}
          options={boardOptions}
          disabled={boardsLoading}
        />
        <SelectField
          label={t("batch2_28.link.shotLabel")}
          value={shotId}
          onChange={setShotId}
          options={shotOptions}
          disabled={!boardId || boardLoading}
        />
      </FlexColumn>
    </Dialog>
  );
};

export const LinkShotDialog = memo(LinkShotDialogInner);
LinkShotDialog.displayName = "LinkShotDialog";

export default LinkShotDialog;
