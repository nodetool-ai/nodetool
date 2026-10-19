/**
 * BoardLineageChip — "Recast from <template>" in the board header.
 *
 * A board a graph derived (`nodetool.storyboard.RecastStoryboard`, design §4.2)
 * carries `templateId`. The chip says where the board came from and opens that
 * board, so the approved original is one click away from the copy. A board
 * authored directly has no `templateId` and the chip renders nothing.
 */

import React, { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";

import { Chip, Tooltip } from "../ui_primitives";
import { trpc } from "../../trpc/client";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";

export interface BoardLineageChipProps {
  boardId: string;
}

const BoardLineageChipInner: React.FC<BoardLineageChipProps> = ({ boardId }) => {
  const { t } = useTranslation();
  const { data: board } = trpc.storyboards.get.useQuery(
    { id: boardId },
    { staleTime: 30_000, retry: false }
  );
  const templateId = board?.document.templateId ?? null;
  const { data: template } = trpc.storyboards.get.useQuery(
    { id: templateId ?? "" },
    { enabled: !!templateId, staleTime: 30_000, retry: false }
  );
  const templateName = template?.name;

  const open = useCallback(() => {
    if (!templateId) {
      return;
    }
    useWorkspaceTabsStore.getState().openTab({
      type: "storyboard",
      ref: templateId,
      mode: "edit",
      title: templateName
    });
  }, [templateId, templateName]);

  if (!templateId) {
    return null;
  }

  return (
    <Tooltip title={t("screens4_11.storyboard.lineage.openSourceBoard")}>
      <Chip
        compact
        label={t("screens4_11.storyboard.lineage.recastFrom", {
          name: templateName ?? t("screens4_11.storyboard.lineage.template")
        })}
        onClick={open}
      />
    </Tooltip>
  );
};

export const BoardLineageChip = memo(BoardLineageChipInner);
BoardLineageChip.displayName = "BoardLineageChip";

export default BoardLineageChip;
