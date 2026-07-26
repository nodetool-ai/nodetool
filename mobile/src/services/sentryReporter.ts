/**
 * Sentry adapter for the {@link ErrorReporter} seam in `./errorReporting`.
 *
 * Crash reporting is **off** until a DSN is configured. The DSN is read from,
 * in order:
 *   1. `extra.sentryDsn` in app.json / app.config.ts
 *   2. the `EXPO_PUBLIC_SENTRY_DSN` env var (baked in at bundle time by Expo)
 *
 * With no DSN, {@link installSentryReporter} returns without calling
 * `Sentry.init` and without replacing the reporter, so the console-only sink
 * stays in place and nothing leaves the device.
 *
 * What is sent: the error, its stack, the `source` tag, the `fatal` flag, and
 * whatever the call site put in `context.extra`. What is not sent: the
 * user-configured API host, auth tokens, and email — `sendDefaultPii` is off
 * and no user is identified. Session replay and performance tracing are
 * disabled; this is crash visibility, not analytics.
 */

import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';
import { setErrorReporter, type ErrorContext, type ErrorReporter } from './errorReporting';

type ExpoExtra = {
  sentryDsn?: string;
};

function resolveDsn(): string | undefined {
  const extra = (Constants.expoConfig?.extra ?? {}) as ExpoExtra;
  const dsn = extra.sentryDsn || process.env.EXPO_PUBLIC_SENTRY_DSN;
  return dsn ? dsn : undefined;
}

const sentryReporter: ErrorReporter = {
  captureException: (error: Error, context?: ErrorContext) => {
    try {
      Sentry.captureException(error, {
        level: context?.fatal ? 'fatal' : 'error',
        tags: {
          source: context?.source ?? 'unknown',
          fatal: String(context?.fatal ?? false),
        },
        contexts: context?.extra ? { nodetool: { ...context.extra } } : {},
      });
    } catch (e) {
      // A broken reporter must never crash the app.
      console.error('[sentryReporter] captureException failed', e);
    }
  },
};

let installed = false;

/**
 * Initialize Sentry and route {@link reportError} through it. No-op when no DSN
 * is configured, and idempotent. Call once at startup, next to
 * `initErrorReporting()` (today in `index.ts`), before any React render.
 */
export function installSentryReporter(): void {
  if (installed) {
    return;
  }

  const dsn = resolveDsn();
  if (!dsn) {
    return;
  }

  const version = Constants.expoConfig?.version;

  try {
    Sentry.init({
      dsn,
      environment: __DEV__ ? 'development' : 'production',
      release: version ? `nodetool-mobile@${version}` : undefined,
      dist: version,
      sendDefaultPii: false,
      // Crash visibility only — no analytics.
      tracesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
    });
  } catch (e) {
    console.error('[sentryReporter] Sentry.init failed', e);
    return;
  }

  installed = true;
  setErrorReporter(sentryReporter);
}

/** Test-only: reset module state between tests. */
export function __resetSentryReporterForTests(): void {
  installed = false;
}
