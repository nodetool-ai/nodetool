import * as Sentry from "@sentry/react";

// Helper function to get environment variables (works in both Vite and Jest environments)
function getEnvMode(): string {
  // Fallback to process.env - works in both Jest and Vite environments
  return process.env.NODE_ENV || "development";
}

function getEnvVar(name: string): string | undefined {
  // For Vite environment variables, they get compiled into process.env during build
  return process.env[name];
}

export function initSentry() {
  if (getEnvMode() === "production") {
    Sentry.init({
      dsn: getEnvVar("VITE_SENTRY_DSN"),
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration()
      ],
      tracesSampleRate: 1.0,
      tracePropagationTargets: [/^https:\/\/app.nodetool\.ai/],
      replaysSessionSampleRate: 0.1, // This sets the sample rate at 10%. You may want to change it to 100% while in development and then sample at a lower rate in production.
      replaysOnErrorSampleRate: 1.0 // If you're not already sampling the entire session, change the sample rate to 100% when sampling sessions where errors occur.
    });
  }
}
