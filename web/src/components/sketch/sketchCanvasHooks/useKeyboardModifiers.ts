/**
 * useKeyboardModifiers
 *
 * Tracks keyboard modifier keys (Shift, Alt, Space, S) used by the sketch canvas.
 * Attaches global keydown/keyup listeners and exposes the state via refs.
 */

import { useEffect, useRef } from "react";

interface UseKeyboardModifiersResult {
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
  /** Fires when Alt becomes held / released (keyboard path). */
  onAltHeldChange?: (held: boolean) => void;
  /** Fires when Shift is released or the window loses focus. */
  onShiftReleased?: () => void;
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
    onAltHeldChange,
    onShiftReleased,
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
      // Ctrl/Cmd+S saves; it must not arm the S brush-size drag.
      if ((e.key === "s" || e.key === "S") && !e.metaKey && !e.ctrlKey) {
        sKeyHeldRef.current = true;
      }
      if (e.key === "Alt") {
        const wasHeld = altHeldRef.current;
        altHeldRef.current = true;
        if (!wasHeld) {
          onAltHeldChange?.(true);
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        shiftHeldRef.current = false;
        onShiftReleased?.();
      }
      if (e.key === " ") {
        spaceHeldRef.current = false;
        onSpaceHeldChange?.(false);
        if (isSpacePanningRef.current) {
          isSpacePanningRef.current = false;
        }
      }
      // macOS sends no keyup for other keys released while Cmd is down.
      if (e.key === "s" || e.key === "S" || e.key === "Meta") {
        sKeyHeldRef.current = false;
        isSizeDraggingRef.current = false;
      }
      if (e.key === "Alt") {
        altHeldRef.current = false;
        onAltHeldChange?.(false);
      }
    };
    // Keys released while the window is unfocused (Alt+Tab, Cmd+Tab, a
    // dialog) never send keyup, so treat losing focus as releasing them.
    const handleBlur = () => {
      shiftHeldRef.current = false;
      onShiftReleased?.();
      sKeyHeldRef.current = false;
      isSizeDraggingRef.current = false;
      if (spaceHeldRef.current) {
        spaceHeldRef.current = false;
        isSpacePanningRef.current = false;
        onSpaceHeldChange?.(false);
      }
      if (altHeldRef.current) {
        altHeldRef.current = false;
        onAltHeldChange?.(false);
      }
    };
    // Not on the dispatcher: modifier-hold state (Shift/Space/S/Alt) is
    // keydown+keyup edges, and the store only dispatches on keydown.
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("blur", handleBlur);
    };
  }, [
    isSpacePanningRef,
    isSizeDraggingRef,
    onSpaceHeldChange,
    onAltHeldChange,
    onShiftReleased,
    shiftHeldRef,
    altHeldRef
  ]);

  return { shiftHeldRef, altHeldRef, spaceHeldRef, sKeyHeldRef };
}
