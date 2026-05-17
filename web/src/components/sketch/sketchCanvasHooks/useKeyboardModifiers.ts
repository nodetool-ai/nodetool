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
  /**
   * Optional refs shared with overlay preview (e.g. `useOverlayRenderer`).
   * When omitted, internal refs are used. Tools update these on pointer
   * events; keyboard listeners must target the same objects for Shift/Alt
   * mid-drag to repaint shape previews.
   */
  shiftHeldRef?: React.MutableRefObject<boolean>;
  altHeldRef?: React.MutableRefObject<boolean>;
}): UseKeyboardModifiersResult {
  const {
    isSpacePanningRef,
    isSizeDraggingRef,
    onSpaceHeldChange,
    shiftHeldRef: shiftHeldRefOpt,
    altHeldRef: altHeldRefOpt
  } = params;

  const internalShiftRef = useRef(false);
  const internalAltRef = useRef(false);
  const shiftHeldRef = shiftHeldRefOpt ?? internalShiftRef;
  const altHeldRef = altHeldRefOpt ?? internalAltRef;
  const spaceHeldRef = useRef(false);
  const sKeyHeldRef = useRef(false);

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
  }, [isSpacePanningRef, isSizeDraggingRef, onSpaceHeldChange, shiftHeldRef, altHeldRef]);

  return { shiftHeldRef, altHeldRef, spaceHeldRef, sKeyHeldRef };
}
