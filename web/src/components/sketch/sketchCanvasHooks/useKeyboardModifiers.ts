/**
 * useKeyboardModifiers
 *
 * Tracks keyboard modifier keys (Shift, Alt, Space, S) used by the sketch canvas.
 * Attaches global keydown/keyup listeners and exposes the state via refs.
 */

import { useEffect, useRef } from "react";

export interface UseKeyboardModifiersResult {
  shiftHeldRef: React.MutableRefObject<boolean>;
  altHeldRef: React.MutableRefObject<boolean>;
  spaceHeldRef: React.MutableRefObject<boolean>;
  sKeyHeldRef: React.MutableRefObject<boolean>;
}

export function useKeyboardModifiers(params: {
  isSpacePanningRef: React.MutableRefObject<boolean>;
  isSizeDraggingRef: React.MutableRefObject<boolean>;
  /** Fires once when Space becomes held / released (not on key-repeat). */
  onSpaceHeldChange?: (held: boolean) => void;
}): UseKeyboardModifiersResult {
  const { isSpacePanningRef, isSizeDraggingRef, onSpaceHeldChange } = params;

  const shiftHeldRef = useRef(false);
  const spaceHeldRef = useRef(false);
  const sKeyHeldRef = useRef(false);
  const altHeldRef = useRef(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        shiftHeldRef.current = true;
      }
      if (e.key === " ") {
        const wasHeld = spaceHeldRef.current;
        spaceHeldRef.current = true;
        if (!wasHeld) {
          onSpaceHeldChange?.(true);
        }
      }
      if (e.key === "s" || e.key === "S") {
        sKeyHeldRef.current = true;
      }
      if (e.key === "Alt") {
        altHeldRef.current = true;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        shiftHeldRef.current = false;
      }
      if (e.key === " ") {
        spaceHeldRef.current = false;
        onSpaceHeldChange?.(false);
        if (isSpacePanningRef.current) {
          isSpacePanningRef.current = false;
        }
      }
      if (e.key === "s" || e.key === "S") {
        sKeyHeldRef.current = false;
        isSizeDraggingRef.current = false;
      }
      if (e.key === "Alt") {
        altHeldRef.current = false;
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
    };
  }, [isSpacePanningRef, isSizeDraggingRef, onSpaceHeldChange]);

  return { shiftHeldRef, altHeldRef, spaceHeldRef, sKeyHeldRef };
}
