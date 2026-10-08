import { useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

import { FlexColumn } from "../../ui_primitives";

export interface GamePanelFocusSnapshot {
  readonly panelId: string;
  readonly node: HTMLElement;
  readonly container: HTMLElement;
}

interface StableGamePanelHostProps {
  readonly id: string;
  readonly slot: HTMLElement | null;
  readonly resolveSlot?: () => HTMLElement | null;
  readonly active: boolean;
  readonly keyboardScope?: boolean;
  readonly focusSnapshot: RefObject<GamePanelFocusSnapshot | null>;
  readonly fallbackFocus: () => HTMLElement | null;
  readonly children: ReactNode;
}

export function StableGamePanelHost({ id, slot, resolveSlot, active, keyboardScope, focusSnapshot, fallbackFocus,
  children }: StableGamePanelHostProps): ReactNode {
  const [container] = useState(() => {
    const element = window.document.createElement("div");
    // Shortcut routing and focus capture find a panel through this marker, e.g. `[data-game-panel="viewport"]`.
    element.dataset.gamePanel = id;
    element.style.width = "100%";
    element.style.height = "100%";
    return element;
  });
  useLayoutEffect(() => {
    // Newly mounted slots exist after DOM commit, before focus is restored and paint occurs.
    const targetSlot = resolveSlot ? resolveSlot() : slot;
    const currentFocus = window.document.activeElement;
    const recorded = focusSnapshot.current;
    const focused = currentFocus instanceof HTMLElement && container.contains(currentFocus)
      ? currentFocus
      : currentFocus === window.document.body && recorded?.panelId === id && recorded.container === container ? recorded.node : null;
    container.dataset.gamePanel = id;
    container.toggleAttribute("data-game-undo-scope", Boolean(keyboardScope));
    const locked = window.document.pointerLockElement;
    if ((!active || !targetSlot) && locked && container.contains(locked)) {
      window.document.exitPointerLock();
    }
    if ((!active || !targetSlot) && focused) {
      const fallback = fallbackFocus();
      if (fallback?.isConnected && !container.contains(fallback) && !fallback.closest("[hidden], [inert]")) {
        fallback.focus({ preventScroll: true });
      }
    }
    container.hidden = !active || !targetSlot;
    container.inert = !active || !targetSlot;
    if (!targetSlot) { container.remove(); return; }
    if (container.parentElement !== targetSlot) {
      targetSlot.appendChild(container);
      if (active && focused?.isConnected && container.contains(focused)) { focused.focus({ preventScroll: true }); }
    }
  }, [active, container, fallbackFocus, focusSnapshot, id, keyboardScope, resolveSlot, slot]);
  useLayoutEffect(() => () => { container.remove(); }, [container]);
  return createPortal(<FlexColumn sx={{ height: "100%", minHeight: 0, minWidth: 0, overflow: "hidden" }}>
    {children}
  </FlexColumn>, container, id);
}
