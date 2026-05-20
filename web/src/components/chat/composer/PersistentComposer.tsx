// web/src/components/chat/composer/PersistentComposer.tsx
import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import ChatInputSection from "../containers/ChatInputSection";
import { useComposerSlotContext } from "./composerSlotContext";
import { useFlipPosition } from "./useFlipPosition";
import type { AgentPlanner } from "./AgentModeSelector";

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const HIDDEN_BOX: Box = { top: 0, left: 0, width: 0, height: 0 };
const NOOP = () => {};

/**
 * Single composer instance shared across the routes nested under
 * ChatComposerLayout. Rendered as a fixed overlay positioned over the active
 * ComposerSlot; FLIP-animates between slots when the active slot changes
 * (i.e. on navigation between the start page and the chat view).
 */
const PersistentComposer: React.FC = () => {
  const { activeSlot, activeSend, setComposerHeight } =
    useComposerSlotContext();
  const status = useGlobalChatStore((s) => s.status);
  const selectedModel = useGlobalChatStore((s) => s.selectedModel);
  const selectedTools = useGlobalChatStore((s) => s.selectedTools);
  const agentMode = useGlobalChatStore((s) => s.agentMode);
  const setSelectedModel = useGlobalChatStore((s) => s.setSelectedModel);
  const setSelectedTools = useGlobalChatStore((s) => s.setSelectedTools);
  const setAgentMode = useGlobalChatStore((s) => s.setAgentMode);
  const stopGeneration = useGlobalChatStore((s) => s.stopGeneration);
  const selectedCollections = useGlobalChatStore((s) => s.selectedCollections);
  const setSelectedCollections = useGlobalChatStore(
    (s) => s.setSelectedCollections
  );
  const agentPlanner = useGlobalChatStore((s) => s.agentPlanner);
  const setAgentPlanner = useGlobalChatStore((s) => s.setAgentPlanner);
  const createNewThread = useGlobalChatStore((s) => s.createNewThread);
  const switchThread = useGlobalChatStore((s) => s.switchThread);

  const handleNewChat = useCallback(async () => {
    try {
      const newThreadId = await createNewThread();
      switchThread(newThreadId);
    } catch (error) {
      console.error("Failed to create new thread:", error);
    }
  }, [createNewThread, switchThread]);

  const handleAgentPlannerChange = useCallback(
    (planner: AgentPlanner) => {
      setAgentPlanner(planner);
    },
    [setAgentPlanner]
  );

  const rootRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<Box>(HIDDEN_BOX);

  const measure = useCallback(() => {
    if (!activeSlot) {
      setBox(HIDDEN_BOX);
      return;
    }
    const r = activeSlot.getBoundingClientRect();
    setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [activeSlot]);

  useLayoutEffect(() => {
    measure();
    if (!activeSlot) return;
    window.addEventListener("resize", measure);
    const ro = new ResizeObserver(measure);
    ro.observe(activeSlot);
    return () => {
      window.removeEventListener("resize", measure);
      ro.disconnect();
    };
  }, [activeSlot, measure]);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setComposerHeight(el.offsetHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [setComposerHeight]);

  useFlipPosition(rootRef, [box.top, box.left, box.width]);

  const visible = !!activeSlot;

  // Narrow "stopping" out of status since ChatInputSection doesn't accept it
  const inputStatus =
    status === "stopping"
      ? ("loading" as const)
      : (status as
          | "disconnected"
          | "connecting"
          | "connected"
          | "loading"
          | "error"
          | "streaming"
          | "reconnecting"
          | "disconnecting"
          | "failed");

  return (
    <div
      ref={rootRef}
      data-persistent-composer=""
      style={{
        position: "fixed",
        top: box.top,
        left: box.left,
        width: box.width || undefined,
        height: box.height || undefined,
        visibility: visible ? "visible" : "hidden",
        pointerEvents: visible ? "auto" : "none",
        zIndex: 1200
      }}
    >
      <ChatInputSection
        status={inputStatus}
        onSendMessage={activeSend ?? NOOP}
        onStop={stopGeneration}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        selectedTools={selectedTools}
        onToolsChange={setSelectedTools}
        agentMode={agentMode}
        onAgentModeToggle={setAgentMode}
        selectedCollections={selectedCollections}
        onCollectionsChange={setSelectedCollections}
        agentPlanner={agentPlanner}
        onAgentPlannerChange={handleAgentPlannerChange}
        onNewChat={handleNewChat}
      />
    </div>
  );
};

export default PersistentComposer;
