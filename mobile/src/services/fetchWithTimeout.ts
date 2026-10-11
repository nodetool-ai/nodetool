/** Default limit for a request/response call. */
export const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

/**
 * `fetch` with an abort-based timeout so a request can't hang forever on a
 * flaky mobile network. A caller's own `signal` still aborts the request: the
 * request is cancelled by whichever of the two fires first.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const callerSignal = init.signal;
  const forwardAbort = (): void => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener('abort', forwardAbort);
    }
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', forwardAbort);
  }
}
