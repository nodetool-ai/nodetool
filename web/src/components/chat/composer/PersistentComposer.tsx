// web/src/components/chat/composer/PersistentComposer.tsx
import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import ChatInputSection from "../containers/ChatInputSection";
import { useComposerSlotContext } from "./composerSlotContext";
import { useFlipPosition } from "./useFlipPosition";
import type { LanguageModel } from "../../../stores/ApiTypes";
import type { ComposerSendHandler } from "./composerSlotContext";

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const NOOP = () => {};

type InputStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "loading"
  | "error"
  | "streaming"
  | "reconnecting"
  | "disconnecting"
  | "failed";

interface PositionedComposerProps {
  box: Box;
  visible: boolean;
  status: InputStatus;
  onSendMessage: ComposerSendHandler;
  onStop: () => void;
  onNewChat: () => void;
  selectedModel: LanguageModel;
  onModelChange: (model: LanguageModel) => void;
  setComposerHeight: (px: number) => void;
}

/**
 * The actual fixed overlay. Mounted only once a real slot box exists, so the
 * FLIP hook's first run captures a real position (no spurious animation) and
 * subsequent runs animate between real positions — never from the (0,0)
 * placeholder corner.
 */
const PositionedComposer: React.FC<PositionedComposerProps> = ({
  box,
  visible,
  status,
  onSendMessage,
  onStop,
  onNewChat,
  selectedModel,
  onModelChange,
  setComposerHeight
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Report our own height back to the active slot so it reserves matching space.
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
        status={status}
        onSendMessage={onSendMessage}
        onStop={onStop}
        selectedModel={selectedModel}
        onModelChange={onModelChange}
        onNewChat={onNewChat}
      />
    </div>
  );
};

/**
 * Single composer instance shared across the routes nested under
 * ChatComposerLayout. Measures the active ComposerSlot and positions a fixed
 * overlay over it; FLIP-animates between slots when the active slot changes
 * (i.e. on navigation between the start page and the chat view).
 *
 * The overlay is not rendered until a slot has been measured, and the measured
 * box is retained across transient route-change gaps (when the old slot has
 * unregistered but the new one hasn't registered yet). Together these keep the
 * composer from snapping to the top-left corner and FLIPping in from there.
 */
const PersistentComposer: React.FC = () => {
  const { activeSlot, activeSend, setComposerHeight } =
    useComposerSlotContext();
  const status = useGlobalChatStore((s) => s.status);
  const selectedModel = useGlobalChatStore((s) => s.selectedModel);
  const setSelectedModel = useGlobalChatStore((s) => s.setSelectedModel);
  const stopGeneration = useGlobalChatStore((s) => s.stopGeneration);
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

  const [box, setBox] = useState<Box | null>(null);

  const measure = useCallback(() => {
    // No active slot (mid-route-transition or the Portal setup screen): keep
    // the last measured box so the overlay stays where it was. Resetting to
    // (0,0) here made the composer jump to the top-left corner and FLIP down
    // when the next slot registered. Visibility hides it during the gap.
    if (!activeSlot) return;
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

  // Don't render anything until we have a real slot position; this avoids a
  // (0,0) placeholder frame that the FLIP would otherwise animate in from.
  if (!box) return null;

  // Narrow "stopping" out of status since ChatInputSection doesn't accept it.
  const inputStatus: InputStatus =
    status === "stopping" ? "loading" : (status as InputStatus);

  return (
    <PositionedComposer
      box={box}
      visible={!!activeSlot}
      status={inputStatus}
      onSendMessage={activeSend ?? NOOP}
      onStop={stopGeneration}
      onNewChat={handleNewChat}
      selectedModel={selectedModel}
      onModelChange={setSelectedModel}
      setComposerHeight={setComposerHeight}
    />
  );
};

export default PersistentComposer;
