/**
 * Wait for a `generate_media` request to reach a terminal state, by asking.
 *
 * A subscription cannot do this after a reconnect, and that is not a detail of
 * timing. `GlobalWebSocketManager.subscribe` is a client-side Map with no
 * replay buffer, and the server writes an `rpc_response` to the socket that
 * asked — so a reply that lands while the browser is shut is delivered to a
 * socket that no longer exists, and a handler installed afterwards on a new
 * socket has nothing to receive. Subscribing is an optimization for the case
 * where the socket outlived the surface (a board or sequence closed and
 * reopened in one page session); it is never the recovery mechanism.
 *
 * The generation row is. It outlives the socket and reaches a terminal state
 * whatever the client is doing, so recovery is: read the row until it settles.
 * That also closes the window between the lookup and the subscription, where a
 * reply arriving in between reaches no handler and is lost.
 *
 * Polls are batched — one `lookup_generations` for every id being watched, not
 * one per id — because a board reattaches a whole batch at once.
 */

import { isSettled, lookupGenerations, type GenerationLookup } from "./lookupGenerations";

/** How long before the first poll. Short: most renders settle in seconds. */
const FIRST_DELAY_MS = 2_000;
/** The ceiling the interval backs off to. */
const MAX_DELAY_MS = 15_000;
/** How much each tick stretches the interval. */
const BACKOFF = 1.5;

interface Watch {
  /** Called once, with the row's terminal outcome or null on giving up. */
  settle: (outcome: GenerationLookup | null) => void;
  /** When to stop asking — the entry's own remaining window. */
  deadline: number | null;
}

const watches = new Map<string, Watch>();
let timer: ReturnType<typeof setTimeout> | undefined;
let delay = FIRST_DELAY_MS;

/**
 * Hand one watch its outcome and drop it.
 *
 * The callback is guarded because it runs a surface's own landing code: a
 * throw there must not abandon every other request being watched in the same
 * tick, which is the whole batch of a board.
 */
const finish = (requestId: string, outcome: GenerationLookup | null): void => {
  const watch = watches.get(requestId);
  if (!watch) {
    return;
  }
  watches.delete(requestId);
  try {
    watch.settle(outcome);
  } catch (error) {
    console.error(
      `generationWatch: settling ${requestId} threw`,
      error
    );
  }
};

const stopTimer = (): void => {
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
  }
  delay = FIRST_DELAY_MS;
};

const scheduleTick = (): void => {
  if (timer !== undefined || watches.size === 0) {
    return;
  }
  timer = setTimeout(() => {
    timer = undefined;
    void tick();
  }, delay);
};

async function tick(): Promise<void> {
  const outcomes = await lookupGenerations([...watches.keys()]);
  for (const [requestId, outcome] of outcomes) {
    if (isSettled(outcome.status)) {
      finish(requestId, outcome);
    }
  }

  // A suspended browser may wake after the deadline with a completed row.
  // Read that result before applying the caller's waiting limit.
  const now = Date.now();
  for (const [requestId, watch] of watches) {
    if (watch.deadline !== null && now >= watch.deadline) {
      finish(requestId, null);
    }
  }

  if (watches.size === 0) {
    stopTimer();
    return;
  }
  delay = Math.min(Math.round(delay * BACKOFF), MAX_DELAY_MS);
  scheduleTick();
}

/**
 * Watch one request until its row settles, or until `deadline` passes.
 * A null deadline keeps unresolved work recoverable until explicitly cleared.
 *
 * `settle` is called at most once: with the terminal row, or with null when the
 * window ran out and the row never settled. Returns a canceller for the case
 * the reply arrives on the socket first — whichever gets there wins.
 */
export function watchGeneration(
  requestId: string,
  deadline: number | null,
  settle: (outcome: GenerationLookup | null) => void
): () => void {
  const isNew = !watches.has(requestId);
  watches.set(requestId, { settle, deadline });
  // A newly watched request starts the interval over — and that means
  // rescheduling, not just resetting the delay: a timer already pending was
  // armed at whatever the last long-running request had backed off to, so
  // without this a board reattached after a slow render waits 15s for its
  // first answer.
  if (isNew) {
    delay = FIRST_DELAY_MS;
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }
  scheduleTick();
  return () => {
    watches.delete(requestId);
    if (watches.size === 0) {
      stopTimer();
    }
  };
}

/** Drop every watch. For tests, and for a sign-out that invalidates them all. */
export function __resetGenerationWatchesForTests(): void {
  watches.clear();
  stopTimer();
}
