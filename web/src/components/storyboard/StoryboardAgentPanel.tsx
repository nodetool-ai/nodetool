import { memo, useCallback, useMemo } from "react";
import type { UiDocumentRef } from "@nodetool-ai/protocol";
import { useTranslation } from "react-i18next";

import AssistantChatPanel from "../chat/assistant/AssistantChatPanel";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";

interface StoryboardAgentPanelProps {
  boardId: string;
}

const StoryboardAgentPanel = ({ boardId }: StoryboardAgentPanelProps) => {
  const { t } = useTranslation();
  const title = useStoryboardStore(
    (state) => state.boards[boardId]?.title ?? ""
  );

  const focused = useMemo<UiDocumentRef>(
    () => ({ type: "storyboard", id: boardId, title: title || null }),
    [boardId, title]
  );

  const getSelection = useCallback(() => {
    const shotId =
      useStoryboardStore.getState().boards[boardId]?.activeShotId ?? null;
    return shotId ? { shot_ids: [shotId] } : null;
  }, [boardId]);

  return (
    <AssistantChatPanel
      chatSource="storyboard_assistant"
      focused={focused}
      getSelection={getSelection}
      workflowId={boardId}
      docsTopic="storyboards"
      docsLabel={t("screens4_20.storyboardAgentPanel.docsLabel")}
      welcomeTitle={t("screens4_20.storyboardAgentPanel.welcomeTitle")}
      welcomeBody={t("screens4_20.storyboardAgentPanel.welcomeBody")}
    />
  );
};

export default memo(StoryboardAgentPanel);
