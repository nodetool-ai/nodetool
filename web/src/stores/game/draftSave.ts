import type { AnyGameDocument } from "@nodetool-ai/protocol";
import { getGameDraftStore } from "./GameDraftStore";

export interface DraftSaveFlight {
  current: Promise<void> | null;
}

/** Share the active save between flush callers, including recovery. */
export async function flushGameDraft(flight: DraftSaveFlight, save: () => Promise<void>): Promise<void> {
  if (flight.current) {
    await flight.current;
    return flushGameDraft(flight, save);
  }
  const pending = Promise.resolve().then(save);
  flight.current = pending;
  try {
    await pending;
  } finally {
    if (flight.current === pending) { flight.current = null; }
  }
}

/** Resource echoes must not merge a batch before its acknowledgement. */
export async function pullGameDraft(flight: DraftSaveFlight, pull: () => Promise<void>): Promise<void> {
  while (flight.current) {
    try { await flight.current; } catch { /* A failed save still permits reloading the server draft. */ }
  }
  await flushGameDraft(flight, pull);
}


export function reloadRejectedGameDraft(gameId: string, attemptedToken: string, document: AnyGameDocument, serverToken: string, rejection: unknown): boolean {
  if (serverToken !== attemptedToken || !rejection || typeof rejection !== "object" || !("data" in rejection)) { return false; }
  const data = rejection.data;
  if (!data || typeof data !== "object" || !("code" in data) || data.code !== "BAD_REQUEST") { return false; }
  getGameDraftStore(gameId).getState().load(document, serverToken);
  return true;
}
