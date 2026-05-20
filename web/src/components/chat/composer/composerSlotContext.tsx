// web/src/components/chat/composer/composerSlotContext.tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState
} from "react";
import type { MessageContent } from "../../../stores/ApiTypes";
import type { MediaGenerationRequest } from "../types/media.types";

export type ComposerSendHandler = (
  content: MessageContent[],
  prompt: string,
  agentMode: boolean,
  mediaGeneration?: MediaGenerationRequest
) => void | Promise<void>;

interface ComposerSlotContextValue {
  activeSlot: HTMLElement | null;
  activeSend: ComposerSendHandler | null;
  composerHeight: number;
  registerSlot: (el: HTMLElement, send: ComposerSendHandler) => void;
  unregisterSlot: (el: HTMLElement) => void;
  setComposerHeight: (px: number) => void;
}

const ComposerSlotContext = createContext<ComposerSlotContextValue | null>(
  null
);

export const ComposerSlotProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const [activeSlot, setActiveSlot] = useState<HTMLElement | null>(null);
  const [composerHeight, setComposerHeight] = useState(0);
  const sendRef = useRef<ComposerSendHandler | null>(null);
  const [activeSend, setActiveSend] = useState<ComposerSendHandler | null>(
    null
  );

  const registerSlot = useCallback(
    (el: HTMLElement, send: ComposerSendHandler) => {
      sendRef.current = send;
      setActiveSlot(el);
      setActiveSend(() => send);
    },
    []
  );

  const unregisterSlot = useCallback((el: HTMLElement) => {
    setActiveSlot((current) => {
      if (current === el) {
        sendRef.current = null;
        setActiveSend(null);
        return null;
      }
      return current;
    });
  }, []);

  const value = useMemo<ComposerSlotContextValue>(
    () => ({
      activeSlot,
      activeSend,
      composerHeight,
      registerSlot,
      unregisterSlot,
      setComposerHeight
    }),
    [activeSlot, activeSend, composerHeight, registerSlot, unregisterSlot]
  );

  return (
    <ComposerSlotContext.Provider value={value}>
      {children}
    </ComposerSlotContext.Provider>
  );
};

export function useComposerSlotContext(): ComposerSlotContextValue {
  const ctx = useContext(ComposerSlotContext);
  if (!ctx) {
    throw new Error(
      "useComposerSlotContext must be used within a ComposerSlotProvider"
    );
  }
  return ctx;
}
