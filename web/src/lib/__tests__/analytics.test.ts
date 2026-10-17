/**
 * Browser analytics: client type resolution, consent gating, identity that
 * ignores sign-in, and run events that carry only buckets.
 */
import { readFileSync } from "fs";
import { join } from "path";
import {
  ANALYTICS_INGEST_PATH,
  analyticsStorageKeys,
  createMemoryAnalyticsStore,
  createWebStorageAnalyticsStore,
  type AnalyticsBatch
} from "@nodetool-ai/analytics";

let mockIsElectron = false;
let mockCloud = false;

jest.mock("../env", () => ({
  get isElectron() {
    return mockIsElectron;
  }
}));

jest.mock("../runtimeConfig", () => ({
  isCloudProfile: () => mockCloud,
  getRuntimeConfig: () => ({ version: "0.8.4" })
}));

import {
  getProductAnalytics,
  initProductAnalytics,
  isConsentPromptRequested,
  noteWorkflowRunFinished,
  noteWorkflowRunStarted,
  resetProductAnalyticsForTests,
  resolveWebClientType,
  trackProductEvent
} from "../analytics";

const JOB_ID = "0123456789abcdef0123456789abcdef";

type FetchMock = jest.Mock<Promise<Response>, [RequestInfo | URL, RequestInit?]>;

const okFetch = (): FetchMock =>
  jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>(
    async () => ({ ok: true, status: 202 }) as Response
  );

const sentBatches = (fetchMock: FetchMock): AnalyticsBatch[] =>
  fetchMock.mock.calls.map(
    ([, init]) => JSON.parse(init?.body as string) as AnalyticsBatch
  );

beforeEach(() => {
  mockIsElectron = false;
  mockCloud = false;
  window.localStorage.clear();
  resetProductAnalyticsForTests();
});

afterEach(() => {
  resetProductAnalyticsForTests();
});

describe("resolveWebClientType", () => {
  it("names the client from how the app runs, never the user agent", () => {
    expect(resolveWebClientType()).toBe("local_web");
    mockCloud = true;
    expect(resolveWebClientType()).toBe("cloud_web");
    mockIsElectron = true;
    expect(resolveWebClientType()).toBe("local_desktop");
  });

  it("does not read the user agent or the location", () => {
    const source = readFileSync(join(__dirname, "..", "analytics.ts"), "utf8");
    expect(source).not.toMatch(/userAgent|location\.|hostname|document\.referrer/);
  });
});

describe("consent", () => {
  it("sends nothing before consent", async () => {
    const fetchMock = okFetch();
    const client = initProductAnalytics({ fetch: fetchMock });
    await client?.ready;
    noteWorkflowRunStarted(JOB_ID, 12);
    noteWorkflowRunFinished(JOB_ID, "completed");
    trackProductEvent({ event: "workflow_created", properties: {} });
    await client?.flush({ force: true });
    await client?.endSession();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(client?.recentEvents()).toEqual([]);
    expect(window.localStorage.getItem(analyticsStorageKeys("local_web").queue)).toBeNull();
  });

  it("sends typed, bucketed events to its own server once granted", async () => {
    const fetchMock = okFetch();
    const client = initProductAnalytics({ fetch: fetchMock });
    await client?.ready;
    await client?.setConsent("productAnalytics", "granted");
    noteWorkflowRunStarted(JOB_ID, 12);
    noteWorkflowRunFinished(
      JOB_ID,
      "failed",
      new Error("Provider error reading /Users/alice/photo.png")
    );
    await client?.flush({ force: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`http://localhost:7777${ANALYTICS_INGEST_PATH}`);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "omit" });
    const [batch] = sentBatches(fetchMock);
    expect(batch.events.map((event) => event.event)).toEqual([
      "workflow_run",
      "workflow_run_failed"
    ]);
    expect(batch.events[1].properties).toEqual({
      executionMode: "local",
      nodeCountBucket: "6-20",
      durationBucket: "<1s",
      errorCategory: "provider"
    });
    const serialized = JSON.stringify(batch);
    for (const leaked of [JOB_ID, "alice", "photo.png", "Provider error"]) {
      expect(serialized).not.toContain(leaked);
    }
  });

  it("keeps each client type's consent separate on one origin", async () => {
    const cloudStore = createWebStorageAnalyticsStore(window.localStorage, "cloud_web");
    const cloud = initProductAnalytics({ store: cloudStore, clientType: "cloud_web" });
    await cloud?.ready;
    await cloud?.setConsent("productAnalytics", "granted");
    resetProductAnalyticsForTests();

    const local = initProductAnalytics({ fetch: okFetch() });
    await local?.ready;
    expect(local?.getConsent().productAnalytics).toBe("unset");
    expect(local?.isEnabled()).toBe(false);
  });

  it("asks for consent only after a successful run", async () => {
    const client = initProductAnalytics({ fetch: okFetch() });
    await client?.ready;
    expect(isConsentPromptRequested()).toBe(false);
    noteWorkflowRunStarted(JOB_ID, 3);
    noteWorkflowRunFinished(JOB_ID, "failed", new Error("boom"));
    expect(isConsentPromptRequested()).toBe(false);
    noteWorkflowRunStarted(JOB_ID, 3);
    noteWorkflowRunFinished(JOB_ID, "completed");
    expect(isConsentPromptRequested()).toBe(true);
  });
});

describe("identity", () => {
  it("keeps the same anonymous ID across sign-in, because it never sees the account", async () => {
    const fetchMock = okFetch();
    const first = initProductAnalytics({ fetch: fetchMock });
    await first?.ready;
    await first?.setConsent("productAnalytics", "granted");
    trackProductEvent({ event: "workflow_created", properties: {} });
    await first?.flush({ force: true });
    const before = sentBatches(fetchMock)[0].events[0].anonymousId;

    // A sign-in reloads the app; nothing about the account reaches analytics.
    resetProductAnalyticsForTests();
    const second = initProductAnalytics({ fetch: fetchMock });
    await second?.ready;
    trackProductEvent({ event: "workflow_created", properties: {} });
    await second?.flush({ force: true });
    const after = sentBatches(fetchMock)[1].events[0].anonymousId;

    expect(before).toMatch(/^[0-9a-f-]{36}$/);
    expect(after).toBe(before);
    const source = readFileSync(join(__dirname, "..", "analytics.ts"), "utf8");
    expect(source).not.toMatch(/useAuth|supabase|session\.user|user_id|userId/);
  });
});

describe("desktop", () => {
  it("works without sign-in and reports the desktop client", async () => {
    mockIsElectron = true;
    const fetchMock = okFetch();
    const store = createMemoryAnalyticsStore();
    const client = initProductAnalytics({ store, fetch: fetchMock });
    await client?.ready;
    await client?.setConsent("productAnalytics", "granted");
    trackProductEvent({ event: "workflow_created", properties: {} });
    await client?.flush({ force: true });
    const [batch] = sentBatches(fetchMock);
    expect(batch.events[0]).toMatchObject({
      event: "workflow_created",
      clientType: "local_desktop",
      platform: "other"
    });
    expect(getProductAnalytics()).toBe(client);
  });
});
