import React, { memo, useCallback, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";

import MediaChatComposer from "../chat/composer/MediaChatComposer";
import WorkspaceChip from "../workspaces/WorkspaceChip";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { useNodeStoreRef } from "../../contexts/NodeContext";
import { useAutoAddGeneratedMediaToCanvas } from "../../hooks/handlers/useAutoAddGeneratedMediaToCanvas";
import { buildUiContext } from "../../lib/chat/uiContext";
import type { MessageContent } from "../../stores/ApiTypes";
import type {
  ChatOutgoingMessage,
  MediaGenerationRequest
} from "../../stores/MediaGenerationStore";

/**
 * Media composer for the workflow canvas. Reuses the chat `MediaChatComposer`
 * so its generated image/video/audio results land in the chat panel's history.
 * Finished generations are auto-added to the canvas as constant nodes (see
 * {@link useAutoAddGeneratedMediaToCanvas}); the per-asset hover buttons and
 * drag-to-canvas remain for adding them again or placing them by hand.
 * Generation routes through the normal chat pipeline.
 */
interface CanvasMediaComposerProps {
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

  // Drop each finished generation onto the canvas automatically.
  useAutoAddGeneratedMediaToCanvas();

  // The open graph, read at send time rather than subscribed: the selection
  // changes on every canvas click and this composer must not re-render with it.
  const nodeStore = useNodeStoreRef();

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
      const { workflow, getSelectedNodes } = nodeStore.getState();
      // Tell the agent which graph it is looking at. The `ui_*` graph tools
      // take a workflow id, and the canvas is the one surface that knows it
      // without going through the tab store.
      const selectedNodeIds = getSelectedNodes().map((node) => node.id);
      const uiContext = workflow?.id
        ? buildUiContext({
            source: "workflow_canvas",
            focused: {
              type: "workflow",
              id: workflow.id,
              title: workflow.name
            },
            selection:
              selectedNodeIds.length > 0
                ? { node_ids: selectedNodeIds }
                : undefined
          })
        : null;
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
        ui_context: uiContext,
        // Intentionally no workflow_target: the canvas document is being
        // edited, not run as a chat-responder. Setting it routes the backend
        // into handleWorkflowMessage, which runs the graph as the responder.
        // The store still attaches the bound `workflow_id` as ambient context.
        media_generation: isMedia ? mediaGeneration : null
      } as ChatOutgoingMessage;
      void sendMessage(outgoing);
    },
    [selectedModel, sendMessage, nodeStore]
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
      leadingActions={leadingActions}
      chipActions={<WorkspaceChip />}
      trailingActions={trailingActions}
    />
  );
};

export default memo(CanvasMediaComposer);
