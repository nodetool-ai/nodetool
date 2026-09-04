/**
 * Process-wide drain state.
 *
 * A chat turn already survives a dropped socket ({@link ChatTurnSession}), but
 * not a restart: the process goes away with the turn's unwritten transcript
 * rows and its unflushed spans. Fly allows at most 300 s between SIGTERM and
 * the kill, and a turn can run for half an hour, so the deploy drains a machine
 * *before* it signals it — SIGUSR2 sets this flag, and the machine then takes
 * no new work while the turns already in flight finish here.
 *
 * Draining changes four things: `/health` answers 503, so the proxy routes new
 * clients to the other machine; a new `/ws` handshake is refused with 503; an
 * idle connection is closed with 1012 (service restart) and one holding a turn
 * or run is closed when that settles; and `chat_message` / `run_job` are
 * refused before anything is persisted. SIGTERM sets the same flag as a
 * fallback and then aborts what is left.
 *
 * One flag, one process, no un-drain: a machine that has started draining is on
 * its way out.
 */

import { createLogger } from "@nodetool-ai/config";

const log = createLogger("nodetool.websocket.drain");

let draining = false;
const listeners = new Set<() => void>();

/** True once this process has entered the drain. */
export function isDraining(): boolean {
  return draining;
}

/** Enter the drain. Idempotent — a second call notifies nobody. */
export function startDrain(): void {
  if (draining) return;
  draining = true;
  log.info("Draining: taking no new work");
  for (const listener of [...listeners]) {
    runListener(listener);
  }
}

/**
 * React to the drain. A listener registered while already draining runs at
 * once: a connection accepted in the window before the refusal took effect has
 * to close itself the same way one that predates the drain does. Returns the
 * unsubscribe.
 */
export function onDrain(listener: () => void): () => void {
  listeners.add(listener);
  if (draining) runListener(listener);
  return () => {
    listeners.delete(listener);
  };
}

function runListener(listener: () => void): void {
  try {
    listener();
  } catch (err) {
    log.warn("Drain listener failed", {
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

/** Test-only: return the process to the not-draining state. */
export function _resetDrainForTest(): void {
  draining = false;
  listeners.clear();
}
