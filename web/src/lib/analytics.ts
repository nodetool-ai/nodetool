/**
 * Opt-in, anonymous product analytics for the browser clients: the hosted web
 * app (`cloud_web`), the desktop renderer (`local_desktop`) and a self-hosted
 * or locally served web UI (`local_web`). See docs/analytics.md.
 *
 * Nothing is sent until the person turns product analytics on in Settings →
 * Privacy. Consent, the anonymous ID and the unsent queue live in this
 * browser's storage under a key per client type, so they are never tied to an
 * account, never change at sign-in or sign-out, and never carry over between
 * Cloud, local web and desktop. Events go same-origin to the app's own server
 * (`/api/analytics/v1/events`), which validates them and relays only the body.
 *
 * Analytics never affects the product: every function here swallows its own
 * errors.
 */
import {
  ANALYTICS_INGEST_PATH,
  bucketDuration,
  bucketNodeCount,
  bucketViewport,
  categorizeError,
  createAnalyticsClient,
  createFetchTransport,
  createWebStorageAnalyticsStore,
  normalizeAppVersion,
  platformFromNode,
  type AnalyticsClient,
  type AnalyticsClientType,
  type AnalyticsEvent,
  type AnalyticsPlatform,
  type AnalyticsStore,
  type ExecutionMode,
  type Feature,
  type FirstRunStarter,
  type NodeCountBucket,
  type ViewportClass
} from "@nodetool-ai/analytics";
import { BASE_URL } from "../stores/BASE_URL";
import useOnboardingStore from "../stores/OnboardingStore";
import { isElectron } from "./env";
import { getRuntimeConfig, isCloudProfile } from "./runtimeConfig";

/**
 * The client type comes from how the app is running, never from the user
 * agent: the desktop shell exposes `window.api`, and the server reports
 * whether it runs the cloud profile.
 */
export const resolveWebClientType = (): AnalyticsClientType => {
  if (isElectron) {
    return "local_desktop";
  }
  return isCloudProfile() ? "cloud_web" : "local_web";
};

const resolvePlatform = (clientType: AnalyticsClientType): AnalyticsPlatform => {
  if (clientType !== "local_desktop") {
    return "web";
  }
  const platform =
    typeof window !== "undefined" ? window.api?.platform : undefined;
  return typeof platform === "string" ? platformFromNode(platform) : "other";
};

const browserStore = (clientType: AnalyticsClientType): AnalyticsStore | null => {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    return createWebStorageAnalyticsStore(window.localStorage, clientType);
  } catch {
    // Storage is blocked: analytics stays off.
    return null;
  }
};

let client: AnalyticsClient | null = null;
let unloadListener: (() => void) | null = null;

export interface InitProductAnalyticsOptions {
  /** Overrides for tests. */
  store?: AnalyticsStore;
  fetch?: typeof globalThis.fetch;
  clientType?: AnalyticsClientType;
}

/**
 * Create the browser's analytics client once the runtime config is known.
 * Safe to call more than once. Records `app_started`, which is only sent if
 * consent is (or later becomes) granted for this client.
 */
export const initProductAnalytics = (
  options: InitProductAnalyticsOptions = {}
): AnalyticsClient | null => {
  if (client) {
    return client;
  }
  try {
    const clientType = options.clientType ?? resolveWebClientType();
    const store = options.store ?? browserStore(clientType);
    if (!store) {
      return null;
    }
    client = createAnalyticsClient({
      clientType,
      // Cloud asks at the start of the first session (see
      // `noteFirstRunViewed`), so the steps taken before the answer are held
      // in memory and sent only if the answer is yes.
      holdUntilAnswered: clientType === "cloud_web",
      appVersion: normalizeAppVersion(getRuntimeConfig().version),
      platform: resolvePlatform(clientType),
      store,
      transport: createFetchTransport({
        url: `${BASE_URL}${ANALYTICS_INGEST_PATH}`,
        fetch: options.fetch,
        keepalive: true
      })
    });
    client.track({ event: "app_started", properties: {} });
    if (typeof window !== "undefined") {
      const active = client;
      unloadListener = () => {
        void active.endSession();
      };
      window.addEventListener("pagehide", unloadListener);
    }
    return client;
  } catch {
    client = null;
    return null;
  }
};

/** The browser's analytics client, or null before init or when storage is blocked. */
export const getProductAnalytics = (): AnalyticsClient | null => client;

let consentPromptRequested = false;
const consentPromptListeners = new Set<() => void>();

/**
 * The consent question is asked once: after the person's first successful
 * run, or on Cloud when Home first shows the first-run starters. This flag
 * says one of those happened this session.
 */
export const isConsentPromptRequested = (): boolean => consentPromptRequested;

export const subscribeConsentPrompt = (listener: () => void): (() => void) => {
  consentPromptListeners.add(listener);
  return () => {
    consentPromptListeners.delete(listener);
  };
};

const requestConsentPrompt = (): void => {
  if (consentPromptRequested) {
    return;
  }
  consentPromptRequested = true;
  for (const listener of consentPromptListeners) {
    listener();
  }
};

/** For tests: drop the client so the next init starts fresh. */
export const resetProductAnalyticsForTests = (): void => {
  if (unloadListener && typeof window !== "undefined") {
    window.removeEventListener("pagehide", unloadListener);
  }
  unloadListener = null;
  client?.shutdown();
  client = null;
  runStarts.clear();
  consentPromptRequested = false;
  firstRunViewedNoted = false;
};

const currentViewport = (): ViewportClass =>
  bucketViewport(typeof window === "undefined" ? Number.NaN : window.innerWidth);

let firstRunViewedNoted = false;

/**
 * Home showed the first-run starters. Recorded once per page load. On Cloud
 * this is also when the consent question is asked: most first sessions never
 * finish a workflow run, so asking after one meant almost nobody was asked.
 */
export const noteFirstRunViewed = (): void => {
  try {
    if (firstRunViewedNoted) {
      return;
    }
    firstRunViewedNoted = true;
    trackProductEvent({
      event: "first_run_viewed",
      properties: { viewport: currentViewport() }
    });
    if (resolveWebClientType() === "cloud_web") {
      requestConsentPrompt();
    }
  } catch {
    // Analytics never affects the product.
  }
};

/** A first-run starter on Home was picked. */
export const noteStarterSelected = (starter: FirstRunStarter): void => {
  trackProductEvent({
    event: "starter_selected",
    properties: { starter, viewport: currentViewport() }
  });
};

/**
 * The person saw their first output: a chat reply, a finished run, a
 * screenplay or a game design. Marks it in the onboarding store, which retires
 * the first-run starters, and records `first_result` once per browser.
 */
export const recordFirstResult = (feature: Feature): void => {
  try {
    const onboarding = useOnboardingStore.getState();
    if (onboarding.firstResult) {
      return;
    }
    onboarding.markFirstResult();
    const sincePageLoad =
      typeof performance === "undefined" ? Number.NaN : performance.now();
    trackProductEvent({
      event: "first_result",
      properties: {
        feature,
        durationBucket: bucketDuration(sincePageLoad),
        viewport: currentViewport()
      }
    });
  } catch {
    // Analytics never affects the product.
  }
};

/** Record one typed event. A no-op without consent. */
export const trackProductEvent = (event: AnalyticsEvent): void => {
  try {
    client?.track(event);
  } catch {
    // Analytics never affects the product.
  }
};

const executionMode = (): ExecutionMode =>
  client && resolveWebClientType() === "cloud_web" ? "cloud" : "local";

interface RunStart {
  startedAt: number;
  nodeCountBucket: NodeCountBucket;
  executionMode: ExecutionMode;
}

/** In-flight runs by job ID. The ID never leaves this map. */
const runStarts = new Map<string, RunStart>();
const MAX_TRACKED_RUNS = 100;

/** A workflow run started. Takes only the node count, which is bucketed. */
export const noteWorkflowRunStarted = (jobId: string, nodeCount: number): void => {
  try {
    if (!client) {
      return;
    }
    const start: RunStart = {
      startedAt: Date.now(),
      nodeCountBucket: bucketNodeCount(nodeCount),
      executionMode: executionMode()
    };
    if (runStarts.size >= MAX_TRACKED_RUNS) {
      const oldest = runStarts.keys().next().value;
      if (oldest !== undefined) {
        runStarts.delete(oldest);
      }
    }
    runStarts.set(jobId, start);
    trackProductEvent({
      event: "workflow_run",
      properties: {
        executionMode: start.executionMode,
        nodeCountBucket: start.nodeCountBucket
      }
    });
  } catch {
    // Analytics never affects a run.
  }
};

/**
 * A workflow run ended. The error message is reduced to a category here and
 * is never sent.
 */
export const noteWorkflowRunFinished = (
  jobId: string,
  status: "completed" | "failed" | "cancelled",
  error?: unknown
): void => {
  try {
    const start = runStarts.get(jobId);
    if (!start) {
      return;
    }
    runStarts.delete(jobId);
    const base = {
      executionMode: start.executionMode,
      nodeCountBucket: start.nodeCountBucket,
      durationBucket: bucketDuration(Date.now() - start.startedAt)
    };
    if (status === "completed") {
      trackProductEvent({ event: "workflow_run_succeeded", properties: base });
      recordFirstResult("workflow");
      requestConsentPrompt();
      return;
    }
    trackProductEvent({
      event: "workflow_run_failed",
      properties: {
        ...base,
        errorCategory: status === "cancelled" ? "cancelled" : categorizeError(error)
      }
    });
  } catch {
    // Analytics never affects a run.
  }
};
