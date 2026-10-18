/**
 * Product analytics emitted by the cloud backend itself (`cloud_backend`).
 *
 * Off unless the server runs the cloud profile and the operator sets
 * `NODETOOL_ANALYTICS_BACKEND=1`; `NODETOOL_TELEMETRY=0` still wins. The
 * events answer aggregate product questions ("how many cloud workflow runs
 * fail, and in which category?"), so they carry no anonymous ID, no session
 * ID, and no account, project, workflow or job identifier. The functions
 * below take only enum values and a duration, so a caller has no way to pass
 * one even by mistake.
 *
 * Operational metrics (latency, queue depth, worker health, CPU) are not
 * product analytics and belong to the OpenTelemetry pipeline in
 * `@nodetool-ai/runtime`, not here.
 */
import {
  DEFAULT_CONSENT,
  bucketDuration,
  categorizeError,
  createAnalyticsClient,
  createFetchTransport,
  createMemoryAnalyticsStore,
  isAnalyticsDisabledByEnv,
  platformFromNode,
  type AnalyticsClient,
  type AnalyticsTransport,
  type Feature
} from "@nodetool-ai/analytics";
import { recordAnalyticsEvents } from "@nodetool-ai/models";
import { isCloudProfile } from "./lib/cloud-profile.js";
import { getVersion } from "./routes/health.js";
import {
  acceptAnalyticsBatch,
  analyticsRelayEndpoint,
  analyticsRouteMode
} from "./routes/analytics.js";

type Env = Readonly<Record<string, string | undefined>>;

export function isBackendAnalyticsEnabled(env: Env = process.env): boolean {
  const flag = env["NODETOOL_ANALYTICS_BACKEND"]?.trim().toLowerCase();
  return (
    (flag === "1" || flag === "true") &&
    isCloudProfile(env as Record<string, string | undefined>) &&
    !isAnalyticsDisabledByEnv(env)
  );
}

/** Stores directly when this server is the ingestion service, else relays. */
function backendTransport(env: Env): AnalyticsTransport {
  if (analyticsRouteMode(env) === "ingest") {
    return {
      async send(batch) {
        const accepted = acceptAnalyticsBatch(batch, new Date());
        if (accepted.ok) await recordAnalyticsEvents(accepted.batch.events);
        return true;
      }
    };
  }
  return createFetchTransport({ url: analyticsRelayEndpoint(env), timeoutMs: 5_000 });
}

export function createBackendAnalyticsClient(
  env: Env = process.env,
  transport: AnalyticsTransport = backendTransport(env)
): AnalyticsClient {
  return createAnalyticsClient({
    clientType: "cloud_backend",
    appVersion: getVersion(),
    platform: platformFromNode(process.platform),
    // The operator's flag is the consent for system-level events. Nothing is
    // stored on disk: a restart simply starts an empty queue.
    store: createMemoryAnalyticsStore({
      consent: { ...DEFAULT_CONSENT, productAnalytics: "granted" }
    }),
    transport,
    flushDelayMs: 60_000
  });
}

let client: AnalyticsClient | null | undefined;

function backendClient(): AnalyticsClient | null {
  if (client === undefined) {
    client = isBackendAnalyticsEnabled() ? createBackendAnalyticsClient() : null;
  }
  return client;
}

/** For tests: forget the cached client so the next call re-reads the env. */
export function resetBackendAnalytics(): void {
  client?.shutdown();
  client = undefined;
}

export function trackExecutionStarted(feature: Feature): void {
  try {
    backendClient()?.track({
      event: "execution_started",
      properties: { executionMode: "cloud", feature }
    });
  } catch {
    // Analytics never affects a run.
  }
}

export function trackExecutionFinished(
  feature: Feature,
  status: "completed" | "failed" | "cancelled",
  durationMs: number,
  error?: unknown
): void {
  try {
    const durationBucket = bucketDuration(durationMs);
    if (status === "completed") {
      backendClient()?.track({
        event: "execution_completed",
        properties: { executionMode: "cloud", feature, durationBucket }
      });
      return;
    }
    backendClient()?.track({
      event: "execution_failed",
      properties: {
        executionMode: "cloud",
        feature,
        durationBucket,
        errorCategory: status === "cancelled" ? "cancelled" : categorizeError(error)
      }
    });
  } catch {
    // Analytics never affects a run.
  }
}
