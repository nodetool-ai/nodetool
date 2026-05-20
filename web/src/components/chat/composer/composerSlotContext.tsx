// web/src/components/chat/composer/composerSlotContext.tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
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

interface ActiveSlot {
  el: HTMLElement;
  send: ComposerSendHandler;
}

export const ComposerSlotProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  // Slot element and its send handler are kept in ONE state value so they can
  // never diverge. (Splitting them invited an impure render-phase setState in
  // unregisterSlot that, under StrictMode's mount→cleanup→remount, left the
  // slot active but the send handler null.)
  const [active, setActive] = useState<ActiveSlot | null>(null);
  const [composerHeight, setComposerHeight] = useState(0);

  const registerSlot = useCallback(
    (el: HTMLElement, send: ComposerSendHandler) => {
      setActive({ el, send });
    },
    []
  );

  const unregisterSlot = useCallback((el: HTMLElement) => {
    setActive((current) => (current && current.el === el ? null : current));
  }, []);

  const value = useMemo<ComposerSlotContextValue>(
    () => ({
      activeSlot: active?.el ?? null,
      activeSend: active?.send ?? null,
      composerHeight,
      registerSlot,
      unregisterSlot,
      setComposerHeight
    }),
    [active, composerHeight, registerSlot, unregisterSlot]
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
