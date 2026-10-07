import { memo, useCallback, useMemo } from "react";
import type { UiContext, UiDocumentRef } from "@nodetool-ai/protocol";

import AssistantChatPanel from "../../../chat/assistant/AssistantChatPanel";
import { gameAssistantPrompt } from "../../gameAssistantPrompt";

interface GameAgentPanelProps {
  gameId: string;
  name: string;
  selectedEntityIds: readonly string[];
  behaviorIndex?: number;
  onThreadId?: (threadId: string | null) => void;
  focusMessage?: { threadId: string; messageId: string; requestId: number } | null;
}

function GameAgentPanel({ gameId, name, selectedEntityIds, behaviorIndex, onThreadId, focusMessage }: GameAgentPanelProps) {
  const focused = useMemo<UiDocumentRef>(() => ({ type: "game", id: gameId, title: name }), [gameId, name]);
  const systemPrompt = useMemo(() => gameAssistantPrompt(gameId), [gameId]);
  const getSelection = useCallback((): UiContext["selection"] => ({ entity_ids: [...selectedEntityIds],
    behavior_index: behaviorIndex }), [selectedEntityIds, behaviorIndex]);

  return (
    <AssistantChatPanel
      chatSource="game_assistant"
      onThreadId={onThreadId}
      focusMessage={focusMessage}
      focused={focused}
      getSelection={getSelection}
      workflowId={gameId}
      systemPrompt={systemPrompt}
      welcomeTitle="Game assistant"
      welcomeBody='Try "Add a boss that appears at wave 5", "Make the forest darker and add fog", or "Why does the player pass through this wall?"'
    />
  );
}

export default memo(GameAgentPanel);
