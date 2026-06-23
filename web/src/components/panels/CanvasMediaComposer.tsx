import React, { memo, useCallback, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";

import MediaChatComposer from "../chat/composer/MediaChatComposer";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { useGenerationToCanvas } from "../../hooks/handlers/useGenerationToCanvas";
import type { MessageContent } from "../../stores/ApiTypes";
import type {
  ChatOutgoingMessage,
  MediaGenerationRequest
} from "../../stores/MediaGenerationStore";

/**
 * Media composer for the workflow canvas. Reuses the chat `MediaChatComposer`
 * but, instead of rendering replies in a thread, its generated image/video/
 * audio results are dropped onto the canvas as constant nodes (see
 * {@link useGenerationToCanvas}). Generation still routes through the chat
 * pipeline, so results also remain visible in the chat panel's history.
 */
export interface CanvasMediaComposerProps {
  /** Workflow controls (Run button + menu) rendered inside the composer
   *  footer. Supplied by FloatingToolBar; kept here so the canvas composer
   *  stays a thin wrapper over MediaChatComposer. */
  trailingActions?: React.ReactNode;
  /** Leading footer content (the dock drag handle), supplied by
   *  FloatingToolBar. */
  leadingActions?: React.ReactNode;
}

const CanvasMediaComposer: React.FC<CanvasMediaComposerProps> = ({
  trailingActions,
  leadingActions
}) => {
  const {
    status,
    sendMessage,
    stopGeneration,
    selectedModel,
    setSelectedModel,
    memoryEnabled,
    setMemoryEnabled
  } = useGlobalChatStore(
    useShallow((state) => ({
      status: state.status,
      sendMessage: state.sendMessage,
      stopGeneration: state.stopGeneration,
      selectedModel: state.selectedModel,
      setSelectedModel: state.setSelectedModel,
      memoryEnabled: state.memoryEnabled,
      setMemoryEnabled: state.setMemoryEnabled
    }))
  );

  const { markGenerationStarted } = useGenerationToCanvas();

  // Establish the chat connection lazily so generation works even when the
  // chat panel was never opened. Skip if it's already wired up by the panel.
  useEffect(() => {
    const state = useGlobalChatStore.getState();
    if (state.status === "disconnected" || state.status === "failed") {
      void state.connect();
    }
  }, []);

  const handleSendMessage = useCallback(
    (
      content: MessageContent[],
      _prompt: string,
      mediaGeneration?: MediaGenerationRequest
    ) => {
      const isMedia = !!mediaGeneration && mediaGeneration.mode !== "chat";
      if (isMedia) {
        markGenerationStarted();
      }
      const outgoing: ChatOutgoingMessage = {
        type: "message",
        name: "",
        role: "user",
        provider: (isMedia
          ? mediaGeneration?.provider ?? selectedModel?.provider
          : selectedModel?.provider) as ChatOutgoingMessage["provider"],
        model: isMedia
          ? mediaGeneration?.model ?? selectedModel?.id
          : selectedModel?.id,
        content,
        // Intentionally no workflow_id: the canvas document is being edited,
        // not run as a chat-responder. Setting it routes the backend into
        // handleWorkflowMessage, which fails with "Workflow <id> not found".
        // Generated assets reach the canvas via the thread message cache
        // (see useGenerationToCanvas), not via this field.
        media_generation: isMedia ? mediaGeneration : null
      } as ChatOutgoingMessage;
      void sendMessage(outgoing);
    },
    [markGenerationStarted, selectedModel, sendMessage]
  );

  return (
    <MediaChatComposer
      isLoading={status === "loading"}
      isStreaming={status === "streaming"}
      onSendMessage={handleSendMessage}
      onStop={stopGeneration}
      selectedModel={selectedModel}
      onModelChange={setSelectedModel}
      memoryEnabled={memoryEnabled}
      onMemoryToggle={setMemoryEnabled}
      autoFocus={false}
      collapsible
      leadingActions={leadingActions}
      trailingActions={trailingActions}
    />
  );
};

export default memo(CanvasMediaComposer);
