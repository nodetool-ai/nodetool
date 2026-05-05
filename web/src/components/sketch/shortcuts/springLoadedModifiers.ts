import { useEffect } from "react";
import { isMac } from "../../../utils/platform";
import { useSketchStore } from "../state";

const SPRING_BLOCKED_TOOLS = new Set(["select", "crop", "segment"]);

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
 *   Blocked when activeTool is select, crop, or segment (those tools own modifier semantics).
 * - Space held → activates pan. `spacePanActive` state lives here.
 *   `useKeyboardModifiers.ts` keeps its own `spaceHeldRef` for pointer-gesture code — separate concern.
 *
 * Attaches its own capture-phase window listeners. Cleared on window blur.
 */
export function useSpringLoadedModifiers(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
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
