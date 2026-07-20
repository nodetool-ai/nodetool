/**
 * Provider-agnostic crash / error reporting.
 *
 * Ships with a console-only sink so nothing is sent off-device by default.
 * A real backend (e.g. a Sentry adapter) can be installed once at startup via
 * {@link setErrorReporter} without touching any call site — the ErrorBoundary,
 * the global handler, and ad-hoc `reportError(...)` calls all route through the
 * active reporter. This gives us a single seam for crash visibility in
 * production without baking a heavy native SDK into the tree.
 */

export interface ErrorContext {
  /** Origin of the error, e.g. 'ErrorBoundary' | 'global' | 'unhandledRejection'. */
  source?: string;
  /** Extra structured data (component stack, ids, etc.). */
  extra?: Record<string, unknown>;
  /** Whether the error was fatal / uncaught. */
  fatal?: boolean;
}

export interface ErrorReporter {
  captureException: (error: Error, context?: ErrorContext) => void;
}

const consoleReporter: ErrorReporter = {
  captureException: (error, context) => {
    console.error(
      `[error${context?.source ? `:${context.source}` : ''}]`,
      error,
      context?.extra ?? ''
    );
  },
};

let reporter: ErrorReporter = consoleReporter;

/** Install a real reporter (e.g. a Sentry adapter) at app startup. */
export function setErrorReporter(next: ErrorReporter): void {
  reporter = next;
}

/** Report a handled or unhandled error through the active reporter. */
export function reportError(error: unknown, context?: ErrorContext): void {
  const err = error instanceof Error ? error : new Error(String(error));
  try {
    reporter.captureException(err, context);
  } catch (e) {
    // A broken reporter must never crash the app.
    console.error('[errorReporting] reporter threw', e);
  }
}

type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;

interface ErrorUtilsLike {
  getGlobalHandler?: () => GlobalErrorHandler;
  setGlobalHandler?: (handler: GlobalErrorHandler) => void;
}

declare const global: typeof globalThis & {
  ErrorUtils?: ErrorUtilsLike;
};

let installed = false;

/**
 * Route React Native's uncaught JS errors through {@link reportError},
 * preserving the previous handler (which renders the red box in dev). Idempotent.
 */
export function initErrorReporting(): void {
  if (installed) {
    return;
  }
  installed = true;

  const errorUtils = global.ErrorUtils;
  if (errorUtils?.setGlobalHandler) {
    const previous = errorUtils.getGlobalHandler?.();
    errorUtils.setGlobalHandler((error, isFatal) => {
      reportError(error, { source: 'global', fatal: isFatal });
      previous?.(error, isFatal);
    });
  }
}

/** Test-only: reset module state between tests. */
export function __resetErrorReportingForTests(): void {
  reporter = consoleReporter;
  installed = false;
}
