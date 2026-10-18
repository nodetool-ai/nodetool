import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { StoreApi } from "zustand";

import type { DockLayout } from "../../stores/dock/DockLayout";
import type { DockLayoutState } from "../../stores/dock/DockLayoutStore";
import type { DockPanelRegistration } from "./panelRegistry";
import type { PanelFocusSnapshot } from "./StablePanelHost";

/** One panel body the editor supplies. `visible: false` leaves it out of the dock while its state stays in the layout. */
export interface DockPanelView {
  readonly id: string;
  readonly node: ReactNode;
  readonly visible?: boolean;
  /** Marks the panel host with `data-dock-keyboard-scope` so editor shortcuts work while focus is inside it. */
  readonly keyboardScope?: boolean;
}

interface DockMetadata {
  readonly store: StoreApi<DockLayoutState>;
  readonly layout: DockLayout;
  readonly registry: readonly DockPanelRegistration[];
  readonly availableIds: readonly string[];
}
export interface DockPresentationInput extends DockMetadata {
  readonly views: readonly DockPanelView[];
  readonly root: RefObject<HTMLElement | null>;
}
export interface DockPresentation {
  readonly metadata: DockMetadata;
  readonly views: readonly DockPanelView[];
  readonly transitioning: boolean;
  readonly focusSnapshot: RefObject<PanelFocusSnapshot | null>;
}

function sameMetadata(a: DockMetadata, b: DockMetadata): boolean {
  return a.store === b.store && a.layout === b.layout && a.registry === b.registry
    && a.availableIds.length === b.availableIds.length && a.availableIds.every((id, index) => id === b.availableIds[index]);
}

export function useDockPresentation(desired: DockPresentationInput): DockPresentation {
  const [metadata, setMetadata] = useState<DockMetadata>(() => ({
    store: desired.store, layout: desired.layout, registry: desired.registry,
    availableIds: desired.availableIds
  }));
  const committedViews = useRef(desired.views);
  const focusSnapshot = useRef<PanelFocusSnapshot | null>(null);
  const capturePending = useRef(false);
  const transitioning = !sameMetadata(metadata, desired);
  // Capture focused content before the next DOM commit removes its slot, then restore before paint.
  useLayoutEffect(() => {
    if (transitioning) {
      if (!capturePending.current) {
        const focused = window.document.activeElement;
        const host = focused instanceof HTMLElement ? focused.closest<HTMLElement>("[data-dock-panel]") : null;
        focusSnapshot.current = focused instanceof HTMLElement && host?.dataset.dockPanel && desired.root.current?.contains(host)
          ? { panelId: host.dataset.dockPanel, container: host, node: focused } : null;
        capturePending.current = true;
      }
      setMetadata({ store: desired.store, layout: desired.layout, registry: desired.registry,
        availableIds: desired.availableIds });
    } else {
      committedViews.current = desired.views;
      focusSnapshot.current = null;
      capturePending.current = false;
    }
  }, [desired, transitioning]);
  return { metadata, views: transitioning ? committedViews.current : desired.views, transitioning, focusSnapshot };
}
