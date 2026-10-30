/**
 * Abort handling for the media module, kept free of node-av so the probes,
 * which run on Mediabunny alone, load without the native addon.
 */

/** The error an aborted media operation rejects with. */
export function abortError(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  if (reason instanceof Error) return reason;
  const error = new Error("The media operation was aborted");
  error.name = "AbortError";
  return error;
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError(signal);
}
