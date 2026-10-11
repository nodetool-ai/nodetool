/**
 * storyboardSaveRegistry
 *
 * Lets a caller that wrote into the storyboard store learn whether the write
 * reached the server. `useStoryboardServerSync` autosaves behind a debounce,
 * so a tool or an agent that returns right after a write says "done" while the
 * save is still pending — or has failed. Each open board registers its saver
 * here; {@link flushStoryboardSave} runs the pending save now and reports the
 * outcome.
 *
 * Registration mirrors {@link setStoryboardAgentHandler}: the hook registers on
 * mount and clears with `null` on unmount.
 */

import { getErrorMessage } from "../../utils/errorHandling";

export type StoryboardSaveResult =
  /** `updatedAt` is null when no server sync is registered for the board. */
  | { ok: true; updatedAt: string | null }
  | { ok: false; error: string };

type StoryboardSaveFlush = () => Promise<StoryboardSaveResult>;

const savers = new Map<string, StoryboardSaveFlush>();
const listeners = new Set<() => void>();

/**
 * Register (or clear, with null) the saver for one board id. Clearing with the
 * saver itself removes it only while it is still the registered one, so a
 * second editor of the board closing does not unregister the first.
 */
export function registerStoryboardSaver(
  boardId: string,
  flush: StoryboardSaveFlush | null,
  owner?: StoryboardSaveFlush
): void {
  if (flush) {
    savers.set(boardId, flush);
  } else if (!owner || savers.get(boardId) === owner) {
    savers.delete(boardId);
  }
  for (const listener of [...listeners]) {
    listener();
  }
}

/** Whether some open editor is saving this board to the server. */
export function hasStoryboardSaver(boardId: string): boolean {
  return savers.has(boardId);
}

/** Hear about savers registering and clearing. Returns the unsubscribe. */
export function subscribeStoryboardSavers(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Cancel the debounce, save the board now, and report the outcome. Never
 * rejects. A board with no registered saver — headless runs, evals — resolves
 * ok with a null revision.
 */
export async function flushStoryboardSave(
  boardId: string
): Promise<StoryboardSaveResult> {
  const flush = savers.get(boardId);
  if (!flush) return { ok: true, updatedAt: null };
  try {
    return await flush();
  } catch (error) {
    return {
      ok: false,
      error: getErrorMessage(error, "Storyboard save failed")
    };
  }
}
