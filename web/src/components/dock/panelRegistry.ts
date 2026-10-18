import type { ReactNode } from "react";

import type { DockPanelRegistration as StoreDockPanelRegistration, DockRegion } from "../../stores/dock/DockLayout";

export type { DockRegion };
/** A dockable panel as the registry stores it. Editors extend this with their own filter fields. */
export interface DockPanelRegistration extends StoreDockPanelRegistration {
  readonly icon: ReactNode;
}

export interface DockPanelRegistry<R extends DockPanelRegistration = DockPanelRegistration> {
  /** Adds a panel and returns the function that removes it. Throws on a duplicate id. */
  readonly register: (panel: R) => () => void;
  readonly subscribe: (listener: () => void) => () => void;
  /** The registered panels in registration order. The array changes identity only when a panel is added or removed. */
  readonly getSnapshot: () => readonly R[];
}

export function createDockPanelRegistry<R extends DockPanelRegistration = DockPanelRegistration>(
  editorLabel: string, freeze: (panel: R) => R = (panel) => ({ ...panel })): DockPanelRegistry<R> {
  const entries = new Map<string, R>();
  const listeners = new Set<() => void>();
  let snapshot: readonly R[] = [];
  const publish = (): void => {
    snapshot = Object.freeze([...entries.values()]);
    for (const listener of listeners) { listener(); }
  };
  return {
    register(panel) {
      if (entries.has(panel.id)) { throw new Error(`${editorLabel.charAt(0).toUpperCase()}${editorLabel.slice(1)} panel ${panel.id} is already registered`); }
      const registration = Object.freeze(freeze(panel));
      entries.set(registration.id, registration);
      publish();
      return () => {
        if (entries.get(registration.id) === registration) {
          entries.delete(registration.id);
          publish();
        }
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getSnapshot() { return snapshot; }
  };
}
