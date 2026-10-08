import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { StoreApi } from "zustand";

import type { GamePanelLayout } from "../../../stores/game/GamePanelLayout";
import type { GamePanelLayoutState } from "../../../stores/game/GamePanelLayoutStore";
import type { GamePanelView } from "./GameEditorShell";
import type { GameDimension, GamePanelRegistration } from "./panelRegistry";
import type { GamePanelFocusSnapshot } from "./StableGamePanelHost";

interface GameDockMetadata {
  readonly store: StoreApi<GamePanelLayoutState>;
  readonly layout: GamePanelLayout;
  readonly registry: readonly GamePanelRegistration[];
  readonly dimension: GameDimension;
  readonly availableIds: readonly string[];
}
export interface GameDockPresentationInput extends GameDockMetadata {
  readonly views: readonly GamePanelView[];
  readonly root: RefObject<HTMLElement | null>;
}
export interface GameDockPresentation {
  readonly metadata: GameDockMetadata;
  readonly views: readonly GamePanelView[];
  readonly transitioning: boolean;
  readonly focusSnapshot: RefObject<GamePanelFocusSnapshot | null>;
}

function sameMetadata(a: GameDockMetadata, b: GameDockMetadata): boolean {
  return a.store === b.store && a.layout === b.layout && a.registry === b.registry && a.dimension === b.dimension
    && a.availableIds.length === b.availableIds.length && a.availableIds.every((id, index) => id === b.availableIds[index]);
}

export function useGameDockPresentation(desired: GameDockPresentationInput): GameDockPresentation {
  const [metadata, setMetadata] = useState<GameDockMetadata>(() => ({
    store: desired.store, layout: desired.layout, registry: desired.registry,
    dimension: desired.dimension, availableIds: desired.availableIds
  }));
  const committedViews = useRef(desired.views);
  const focusSnapshot = useRef<GamePanelFocusSnapshot | null>(null);
  const capturePending = useRef(false);
  const transitioning = !sameMetadata(metadata, desired);
  // Capture focused content before the next DOM commit removes its slot, then restore before paint.
  useLayoutEffect(() => {
    if (transitioning) {
      if (!capturePending.current) {
        const focused = window.document.activeElement;
        const host = focused instanceof HTMLElement ? focused.closest<HTMLElement>("[data-game-panel]") : null;
        focusSnapshot.current = focused instanceof HTMLElement && host?.dataset.gamePanel && desired.root.current?.contains(host)
          ? { panelId: host.dataset.gamePanel, container: host, node: focused } : null;
        capturePending.current = true;
      }
      setMetadata({ store: desired.store, layout: desired.layout, registry: desired.registry,
        dimension: desired.dimension, availableIds: desired.availableIds });
    } else {
      committedViews.current = desired.views;
      focusSnapshot.current = null;
      capturePending.current = false;
    }
  }, [desired, transitioning]);
  return { metadata, views: transitioning ? committedViews.current : desired.views, transitioning, focusSnapshot };
}
