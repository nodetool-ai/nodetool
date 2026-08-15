/**
 * jsScriptSaveRegistry
 *
 * Lets a caller that wrote into the JS script store learn whether the write
 * reached the server. `useJsScriptServerSync` autosaves behind a debounce,
 * so a tool or an agent that returns right after a write says "done" while the
 * save is still pending — or has failed. Each open script registers its saver
 * here; {@link flushJsScriptSave} runs the pending save now and reports the
 * outcome.
 *
 * Registration mirrors {@link setJsScriptAgentHandler}: the hook registers on
 * mount and clears with `null` on unmount.
 */

import { getErrorMessage } from "../../utils/errorHandling";

export type JsScriptSaveResult =
  /** `updatedAt` is null when no server sync is registered for the script. */
  | { ok: true; updatedAt: string | null }
  | { ok: false; error: string };

type JsScriptSaveFlush = () => Promise<JsScriptSaveResult>;

const savers = new Map<string, JsScriptSaveFlush>();

/** Register (or clear, with null) the saver for one script id. */
export function registerJsScriptSaver(
  scriptId: string,
  flush: JsScriptSaveFlush | null
): void {
  if (flush) {
    savers.set(scriptId, flush);
  } else {
    savers.delete(scriptId);
  }
}

/**
 * Cancel the debounce, save the script now, and report the outcome. Never
 * rejects. A script with no registered saver — headless runs, evals — resolves
 * ok with a null revision.
 */
export async function flushJsScriptSave(
  scriptId: string
): Promise<JsScriptSaveResult> {
  const flush = savers.get(scriptId);
  if (!flush) return { ok: true, updatedAt: null };
  try {
    return await flush();
  } catch (error) {
    return {
      ok: false,
      error: getErrorMessage(error, "JS script save failed")
    };
  }
}
