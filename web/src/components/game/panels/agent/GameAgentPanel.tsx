import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { UiContext, UiDocumentRef } from "@nodetool-ai/protocol";

import { FlexColumn } from "../../../ui_primitives";
import AssistantChatPanel from "../../../chat/assistant/AssistantChatPanel";
import { gameAssistantPrompt } from "../../gameAssistantPrompt";
import type { ChatAutoSend } from "../../../chat/containers/ChatView";
import {
  useGameAssistantKickoffStore,
  usePendingGameKickoff
} from "../../../../stores/game/GameAssistantKickoffStore";

interface GameAgentPanelProps {
  gameId: string;
  name: string;
  selectedEntityIds: readonly string[];
  behaviorIndex?: number;
  onThreadId?: (threadId: string | null) => void;
  focusMessage?: { threadId: string; messageId: string; requestId: number } | null;
}

function GameAgentPanel({ gameId, name, selectedEntityIds, behaviorIndex, onThreadId, focusMessage }: GameAgentPanelProps) {
  const { t } = useTranslation();
  const focused = useMemo<UiDocumentRef>(() => ({ type: "game", id: gameId, title: name }), [gameId, name]);
  const systemPrompt = useMemo(() => gameAssistantPrompt(gameId), [gameId]);
  const getSelection = useCallback((): UiContext["selection"] => ({ entity_ids: [...selectedEntityIds],
    behavior_index: behaviorIndex }), [selectedEntityIds, behaviorIndex]);
  // A game the Game flow just built is owed its first turn: finish the game.
  const kickoff = usePendingGameKickoff(gameId);
  const autoSend = useMemo<ChatAutoSend | null>(() => kickoff === null ? null : {
    prompt: kickoff, claim: () => useGameAssistantKickoffStore.getState().claim(gameId) !== null }, [gameId, kickoff]);

  return (
    <FlexColumn sx={{ flex: 1, minHeight: 0, minWidth: 0, height: "100%" }}>
    <AssistantChatPanel
      chatSource="game_assistant"
      onThreadId={onThreadId}
      focusMessage={focusMessage}
      focused={focused}
      getSelection={getSelection}
      workflowId={gameId}
      systemPrompt={systemPrompt}
      welcomeTitle={t("screen_game.agent.welcomeTitle")}
      welcomeBody={t("screen_game.agent.welcomeBody")}
      autoSend={autoSend}
    />
    </FlexColumn>
  );
}

export default memo(GameAgentPanel);
