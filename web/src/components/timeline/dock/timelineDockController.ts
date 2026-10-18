import { createContext, useContext } from "react";
import type { StoreApi } from "zustand";

import { dockGroupOfPanel } from "../../../stores/dock/DockLayout";
import type { DockLayoutState } from "../../../stores/dock/DockLayoutStore";
import type { TimelinePanelId } from "../../../stores/timeline/TimelineDockLayout";
import { UNAVAILABLE_PANEL_NOTICE } from "./timelinePanels";

/** What the key handler and the command menu can ask of the timeline's dock. */
export interface TimelineDockController {
  /** Shows the panel, makes it the active tab of its group and moves focus to it. False when it has nothing to show yet. */
  readonly openPanel: (id: TimelinePanelId) => boolean;
  /** Maximizes the panel group under focus or last clicked, or restores the layout when a group is maximized. */
  readonly toggleMaximize: () => void;
  /** Re-applies the active workspace. */
  readonly resetWorkspace: () => void;
  /** Switches to the built-in workspace at `index`, counting from 0. */
  readonly switchWorkspace: (index: number) => void;
  readonly toggleProgramFullscreen: () => void;
}

export interface TimelineDockControllerOptions {
  readonly store: StoreApi<DockLayoutState>;
  /** Whether the panel has a view to show right now. Contextual panels (Source, Shot, Code) have none until their condition holds. */
  readonly isAvailable: (id: TimelinePanelId) => boolean;
  /** The dock group the user is working in, or null when nothing in the dock was focused or clicked. */
  readonly focusedGroupId: () => string | null;
  /** Moves focus to the active tab of the group showing `id`. */
  readonly focusPanel: (id: TimelinePanelId) => void;
  readonly requestProgramFullscreen: () => void;
  readonly notify: (message: string) => void;
}

export function createTimelineDockController(options: TimelineDockControllerOptions): TimelineDockController {
  const { store, isAvailable, focusedGroupId, focusPanel, requestProgramFullscreen, notify } = options;
  return {
    openPanel(id) {
      if (!isAvailable(id)) {
        notify(UNAVAILABLE_PANEL_NOTICE[id] ?? `The ${id} panel has nothing to show yet.`);
        return false;
      }
      store.getState().revealPanel(id);
      focusPanel(id);
      return true;
    },
    toggleMaximize() {
      const state = store.getState();
      if (state.maximizedGroupId) { state.setMaximizedGroup(null); return; }
      const groupId = focusedGroupId() ?? dockGroupOfPanel(state.layout, "tracks")?.id;
      if (groupId) { state.toggleMaximizedGroup(groupId); }
    },
    resetWorkspace() {
      store.getState().resetLayout();
    },
    switchWorkspace(index) {
      const state = store.getState();
      const name = state.model.presets[index];
      if (name === undefined) { return; }
      state.selectLayout(name);
      state.setMaximizedGroup(null);
    },
    toggleProgramFullscreen: requestProgramFullscreen
  };
}

/** The dock group containing the focused element, else the one last clicked, found by DOM position. */
export function findFocusedDockGroup(root: HTMLElement | null, lastGroupId: string | null): string | null {
  if (!root) { return null; }
  const active = root.ownerDocument.activeElement;
  const focused = active instanceof HTMLElement && root.contains(active)
    ? active.closest<HTMLElement>("[data-dock-group]")?.dataset.dockGroup
    : undefined;
  return focused ?? lastGroupId;
}

/** Focuses the active tab of the group that shows `id`, once the dock has re-rendered. */
export function focusDockPanel(root: HTMLElement | null, id: TimelinePanelId): void {
  if (!root) { return; }
  const focus = (): void => {
    const group = root.querySelector<HTMLElement>(`[data-dock-panel="${id}"]`)?.closest<HTMLElement>("[data-dock-group]");
    group?.querySelector<HTMLElement>("[role='tab'][aria-selected='true']")?.focus({ preventScroll: true });
  };
  if (typeof requestAnimationFrame === "function") { requestAnimationFrame(focus); } else { focus(); }
}

export const TimelineDockContext = createContext<TimelineDockController | null>(null);

/** The dock controller, or null outside the timeline editor's desktop layout. */
export function useTimelineDock(): TimelineDockController | null {
  return useContext(TimelineDockContext);
}
