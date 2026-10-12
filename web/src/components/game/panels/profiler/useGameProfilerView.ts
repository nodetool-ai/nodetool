import { useEffect, useState, type RefObject } from "react";

import type { GameProfileCapture, GameProfiler, GameProfileSample } from "./gameProfiler";

export interface GameProfilerView {
  readonly samples: readonly GameProfileSample[];
  readonly capture: GameProfileCapture | null;
  readonly capturing: boolean;
}

const EMPTY_VIEW: GameProfilerView = { samples: [], capture: null, capturing: false };
/** Four redraws per second keep the graphs readable without re-rendering the editor once per tick. */
export const GAME_PROFILER_REFRESH_MS = 250;

function readView(profiler: GameProfiler): GameProfilerView {
  return { samples: profiler.samples(), capture: profiler.capture(), capturing: profiler.capturing() };
}

/** The dock keeps background tabs mounted inside a `hidden` container, so a panel is shown only outside one. */
function shown(element: HTMLElement | null): boolean {
  return element !== null && element.isConnected && element.closest("[hidden]") === null;
}

/**
 * Keeps the profiler recording while the panel is shown and reads its samples at most every `refreshMs`.
 * A panel in a background dock tab neither records nor re-renders.
 */
export function useGameProfilerView(profiler: GameProfiler | undefined, root: RefObject<HTMLElement | null>,
  refreshMs = GAME_PROFILER_REFRESH_MS): { readonly view: GameProfilerView; readonly refresh: () => void } {
  const [view, setView] = useState<GameProfilerView>(() => profiler ? readView(profiler) : EMPTY_VIEW);
  useEffect(() => {
    if (!profiler) {
      setView(EMPTY_VIEW);
      return;
    }
    let detach: (() => void) | null = null;
    let seen = -1;
    const poll = (): void => {
      if (!shown(root.current)) {
        detach?.();
        detach = null;
        return;
      }
      detach ??= profiler.attach();
      const version = profiler.version();
      if (version === seen) { return; }
      seen = version;
      setView(readView(profiler));
    };
    poll();
    const timer = window.setInterval(poll, refreshMs);
    return () => {
      window.clearInterval(timer);
      detach?.();
    };
  }, [profiler, root, refreshMs]);
  return { view, refresh: () => { if (profiler) { setView(readView(profiler)); } } };
}
