/**
 * LinkShotDialog
 *
 * Links a video clip, and the audio twin that shares its `linkId`, to a shot
 * on a storyboard. The clip keeps its footage; from then on it follows the
 * shot's selected take, and the Shot tab works on that shot.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import type { Shot } from "@nodetool-ai/protocol";

import {
  Caption,
  Dialog,
  FlexColumn,
  FormField,
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

const shotLabel = (shot: Shot): string =>
  `SH ${String(shot.index + 1).padStart(2, "0")} · ${
    shot.slug ?? (shot.action.slice(0, 48) || "Untitled shot")
  }`;

const LinkShotDialogInner = ({ clipId, onClose }: LinkShotDialogProps) => {
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
          ? "Loading storyboards…"
          : (boards?.length ?? 0) === 0
            ? "No storyboards yet"
            : "Choose a storyboard"
      },
      ...(boards ?? []).map((item) => ({
        value: item.id,
        label: item.name || "Untitled storyboard"
      }))
    ],
    [boards, boardsLoading]
  );
  const shotOptions = useMemo(() => {
    // SAFETY: the wire document's `shots` is the passthrough zod mirror of
    // `Shot`, as in useClipStoryboardLink.
    const shots = (board?.document.shots as Shot[] | undefined) ?? [];
    return [
      {
        value: "",
        label: boardId ? "Choose a shot" : "Choose a storyboard first"
      },
      ...[...shots]
        .sort((a, b) => a.index - b.index)
        .map((shot) => ({ value: shot.id, label: shotLabel(shot) }))
    ];
  }, [board, boardId]);

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
      title="Link to a storyboard shot"
      onConfirm={handleConfirm}
      confirmText="Link"
      confirmDisabled={!boardId || !shotId}
    >
      <FlexColumn gap={SPACING.md}>
        <Caption color="secondary">
          The clip keeps its footage. When the shot&apos;s selected take
          changes, the clip plays the new one.
        </Caption>
        <FormField label="Storyboard">
          <SelectField
            label="Storyboard"
            hideLabel
            value={boardId}
            onChange={handleBoardChange}
            options={boardOptions}
            disabled={boardsLoading}
          />
        </FormField>
        <FormField label="Shot">
          <SelectField
            label="Shot"
            hideLabel
            value={shotId}
            onChange={setShotId}
            options={shotOptions}
            disabled={!boardId || boardLoading}
          />
        </FormField>
      </FlexColumn>
    </Dialog>
  );
};

export const LinkShotDialog = memo(LinkShotDialogInner);
LinkShotDialog.displayName = "LinkShotDialog";

export default LinkShotDialog;
