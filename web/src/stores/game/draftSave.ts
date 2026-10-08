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
