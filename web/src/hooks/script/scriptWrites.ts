/**
 * The write running on each script, whichever caller started it.
 *
 * The setup flow and the agent bridge each hold their own `useWriteScript`, so
 * a per-instance flag let a second paid write start. Voicing reads the same
 * registry: a take recorded while a write replaces the lines is paid for and
 * then dropped or left stale, so voicing is refused while a write runs.
 */

import { useSyncExternalStore } from "react";

export interface ActiveWrite {
  controller: AbortController;
  owner: symbol;
}

export const activeWrites = new Map<string, ActiveWrite>();
const writeListeners = new Set<() => void>();

export const notifyWrites = (): void => {
  writeListeners.forEach((listener) => listener());
};

export const subscribeWrites = (listener: () => void): (() => void) => {
  writeListeners.add(listener);
  return () => {
    writeListeners.delete(listener);
  };
};

/** True while any caller writes this script. */
export const isScriptWriting = (scriptId: string): boolean =>
  activeWrites.has(scriptId);

/** {@link isScriptWriting}, as React state. */
export const useScriptWriting = (scriptId: string): boolean =>
  useSyncExternalStore(subscribeWrites, () => activeWrites.has(scriptId));
