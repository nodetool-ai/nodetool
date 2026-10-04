/**
 * Sends a client-side crash to the server's error-trace store
 * (`errorTraces.capture`), so it can be listed, queried by agents and attached
 * to a bug report later. The server redacts every trace before storing it;
 * this side only trims what it sends.
 *
 * Fire-and-forget: a crash handler must not fail because tracing did.
 */
import { trpcClient } from "../trpc/client";
import { getIsElectronDetails } from "./browser";

/** One report per distinct crash per page load; a render loop repeats itself. */
const reported = new Set<string>();
const MAX_REPORTS_PER_PAGE = 20;

function describe(error: unknown): {
  errorType: string | null;
  message: string;
  stack: string | null;
} {
  if (error instanceof Error) {
    return {
      errorType: error.name || null,
      message: error.message || error.name || "Error",
      stack: error.stack ?? null
    };
  }
  return { errorType: null, message: String(error), stack: null };
}

export interface ClientErrorRunContext {
  trace_id: string;
  app_run_id: string;
  span_id?: string;
}

export const reportClientError = (error: unknown, component: string, run?: ClientErrorRunContext): void => {
  const { errorType, message, stack } = describe(error);
  const key = `${run?.app_run_id ?? ""}\n${component}\n${errorType ?? ""}\n${message}`;
  if (reported.has(key) || reported.size >= MAX_REPORTS_PER_PAGE) {
    return;
  }
  reported.add(key);
  try {
    const isElectron = getIsElectronDetails().isElectron;
    const context: Record<string, string> = {
      component: component.slice(0, 200),
      runtime: isElectron ? "electron-renderer" : "browser"
    };
    if (run) {
      context.trace_id = run.trace_id;
      context.app_run_id = run.app_run_id;
      if (run.span_id) { context.span_id = run.span_id; }
    }
    trpcClient.errorTraces.capture
      .mutate({
        source: isElectron ? "electron" : "web",
        error_type: errorType,
        message: message.slice(0, 20_000),
        stack: stack ? stack.slice(0, 50_000) : null,
        context
      })
      .catch(() => {
        // Tracing is best-effort; the crash is already shown to the user.
      });
  } catch {
    // Same: a crash handler must not throw because tracing could not start.
  }
};
