import { useEffect, useRef } from "react";
import { isMac } from "../../../utils/platform";
import { useSketchStore } from "../state";

// Tools that own Ctrl/Cmd as a tool-specific modifier and must not flip to
// the move tool while the user is interacting with them.
//   - crop, segment: locked-state interactions.
//   - transform: Ctrl on edge = skew, Ctrl on corner = scale-from-center,
//     Ctrl+Alt+Shift = perspective.
const SPRING_BLOCKED_TOOLS = new Set(["crop", "segment", "transform"]);

export interface UseSpringLoadedModifiersOptions {
  /** When true, Ctrl/Cmd spring-load is not applied (e.g. shortcuts overlay open). */
  isSuspended?: () => boolean;
}

function isSpringModifierPhysicalKey(e: KeyboardEvent): boolean {
  return isMac()
    ? e.code === "MetaLeft" || e.code === "MetaRight"
    : e.code === "ControlLeft" || e.code === "ControlRight";
}

function isSpringModifierStillHeld(e: KeyboardEvent): boolean {
  return isMac() ? e.getModifierState("Meta") : e.getModifierState("Control");
}

/**
 * Manages spring-loaded modifier state independently of the shortcut dispatcher.
 *
 * - Ctrl/Cmd held (physical key) → temporarily activates move tool.
 *   Blocked when activeTool is crop or segment. Select allows spring-load but the gesture lock
 *   in usePointerHandlers prevents mid-selection-drag tool switches.
 *
 * Attaches its own capture-phase window listeners. Cleared on window blur.
 */
export function useSpringLoadedModifiers(
  options?: UseSpringLoadedModifiersOptions
): void {
  const optsRef = useRef(options);
  optsRef.current = options;

  useEffect(() => {
    const suspended = (): boolean => Boolean(optsRef.current?.isSuspended?.());

    const onKeyDown = (e: KeyboardEvent): void => {
      if (suspended()) {
        return;
      }
      if (e.repeat) return;

      if (isSpringModifierPhysicalKey(e)) {
        const tool = useSketchStore.getState().activeTool;
        if (SPRING_BLOCKED_TOOLS.has(tool)) return;
        e.preventDefault();
        useSketchStore.getState().setTransientMoveModifierHeld(true);
        return;
      }
    };

    const onKeyUp = (e: KeyboardEvent): void => {
      if (suspended()) {
        useSketchStore.getState().setTransientMoveModifierHeld(false);
        return;
      }
      if (isSpringModifierPhysicalKey(e) || !isSpringModifierStillHeld(e)) {
        useSketchStore.getState().setTransientMoveModifierHeld(false);
      }
    };

    const onBlur = (): void => {
      useSketchStore.getState().setTransientMoveModifierHeld(false);
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
}
