// web/src/components/chat/composer/ComposerSlot.tsx
import React, { useLayoutEffect, useRef } from "react";
import {
  useComposerSlotContext,
  type ComposerSendHandler
} from "./composerSlotContext";

interface ComposerSlotProps {
  /** Per-route send handler invoked by the persistent composer. */
  onSend: ComposerSendHandler;
  className?: string;
}

/**
 * Empty spacer that marks where the persistent composer should be anchored on
 * the current route. Registers its DOM element + send handler with the slot
 * context and reserves vertical space equal to the live composer height so
 * content above it lays out correctly while the real composer is rendered as a
 * fixed overlay on top.
 */
const ComposerSlot: React.FC<ComposerSlotProps> = ({ onSend, className }) => {
  const { registerSlot, unregisterSlot, composerHeight } =
    useComposerSlotContext();
  const ref = useRef<HTMLDivElement | null>(null);
  const sendRef = useRef<ComposerSendHandler>(onSend);
  sendRef.current = onSend;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    registerSlot(el, (...args) => sendRef.current(...args));
    return () => {
      unregisterSlot(el);
    };
  }, [registerSlot, unregisterSlot]);

  return (
    <div
      ref={ref}
      className={className}
      data-composer-slot=""
      // Reserve space only once the composer reports a real height; collapse otherwise.
      style={{ height: composerHeight > 0 ? composerHeight : undefined, flexShrink: 0 }}
    />
  );
};

export default ComposerSlot;
