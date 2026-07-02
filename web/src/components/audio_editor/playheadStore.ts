/**
 * Playhead position shared between the playback loop and the UI.
 *
 * Playback advances the playhead ~60×/s. Holding it in React state at the top
 * of the editor would re-render the whole tree every frame, so it lives in
 * this tiny external store instead; only the leaf components that display it
 * (playhead line, clock) subscribe via `useSyncExternalStore`.
 */

export interface PlayheadStore {
  get: () => number;
  set: (seconds: number) => void;
  subscribe: (listener: () => void) => () => void;
}

export const createPlayheadStore = (initial = 0): PlayheadStore => {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (seconds: number) => {
      if (seconds === value) return;
      value = seconds;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
};
