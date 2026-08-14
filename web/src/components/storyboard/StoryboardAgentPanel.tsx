import { memo, useCallback, useMemo } from "react";
import type { UiDocumentRef } from "@nodetool-ai/protocol";

import AssistantChatPanel from "../chat/assistant/AssistantChatPanel";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";

interface StoryboardAgentPanelProps {
  boardId: string;
}

const StoryboardAgentPanel = ({ boardId }: StoryboardAgentPanelProps) => {
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
      docsLabel="Storyboards"
      welcomeTitle="Storyboard Assistant"
      welcomeBody='Ask me to direct the board — e.g. "break this brief into six shots", "add a close-up after shot 3", "generate keyframes for every planned shot", or "assemble the shots into a timeline".'
    />
  );
};

export default memo(StoryboardAgentPanel);
