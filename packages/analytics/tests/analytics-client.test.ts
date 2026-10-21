import { describe, expect, it, vi } from "vitest";
import {
  ANONYMOUS_ID_LIFETIME_MS,
  DEFAULT_CONSENT,
  createAnalyticsClient,
  createMemoryAnalyticsStore,
  type AnalyticsBatch,
  type AnalyticsClientOptions,
  type AnalyticsEvent,
  type AnalyticsStore,
  type AnalyticsTransport,
  type ConsentState
} from "../src/index.js";

const GRANTED: ConsentState = { ...DEFAULT_CONSENT, productAnalytics: "granted" };

const RUN: AnalyticsEvent = {
  event: "workflow_run",
  properties: { executionMode: "local", nodeCountBucket: "6-20" }
};

type UntypedEvent = { event: string; properties: Record<string, string> };

function recordingTransport(accept = true): AnalyticsTransport & {
  batches: AnalyticsBatch[];
} {
  const batches: AnalyticsBatch[] = [];
  return {
    batches,
    send: async (batch) => {
      batches.push(JSON.parse(JSON.stringify(batch)) as AnalyticsBatch);
      return accept;
    }
  };
}

function makeClient(
  overrides: Partial<AnalyticsClientOptions> = {}
): ReturnType<typeof createAnalyticsClient> {
  return createAnalyticsClient({
    clientType: "local_desktop",
    appVersion: "0.8.4",
    platform: "linux",
    store: createMemoryAnalyticsStore(),
    transport: recordingTransport(),
    flushDelayMs: null,
    ...overrides
  });
}

describe("consent", () => {
  it("transmits and stores nothing without consent", async () => {
    const transport = recordingTransport();
    const store = createMemoryAnalyticsStore();
    const client = makeClient({ transport, store });
    client.track(RUN);
    await client.ready;
    client.track(RUN);
    await client.flush({ force: true });
    await client.endSession();
    expect(transport.batches).toEqual([]);
    expect(store.snapshot().queue).toEqual([]);
    expect(store.snapshot().identity).toBeNull();
    expect(client.recentEvents()).toEqual([]);
  });

  it("treats an explicit denial like no answer", async () => {
    const transport = recordingTransport();
    const client = makeClient({
      transport,
      store: createMemoryAnalyticsStore({
        consent: { ...DEFAULT_CONSENT, productAnalytics: "denied" }
      })
    });
    await client.ready;
    client.track(RUN);
    await client.flush({ force: true });
    expect(transport.batches).toEqual([]);
  });

  it("sends once consent is granted", async () => {
    const transport = recordingTransport();
    const client = makeClient({ transport });
    await client.setConsent("productAnalytics", "granted");
    client.track(RUN);
    await client.flush();
    expect(transport.batches).toHaveLength(1);
    expect(transport.batches[0]?.events[0]).toMatchObject({
      event: "workflow_run",
      clientType: "local_desktop",
      properties: { executionMode: "local", nodeCountBucket: "6-20" }
    });
  });

  it("revoking consent stops transmission and clears queue and identity", async () => {
    const transport = recordingTransport(false);
    const store = createMemoryAnalyticsStore({ consent: GRANTED });
    const client = makeClient({ transport, store });
    await client.ready;
    client.track(RUN);
    expect(store.snapshot().queue).toHaveLength(1);
    expect(store.snapshot().identity).not.toBeNull();

    await client.setConsent("productAnalytics", "denied");
    expect(store.snapshot().queue).toEqual([]);
    expect(store.snapshot().identity).toBeNull();
    client.track(RUN);
    await client.flush({ force: true });
    expect(transport.batches).toEqual([]);
  });

  it("keeps the three consent categories independent", async () => {
    const transport = recordingTransport();
    const client = makeClient({ transport });
    await client.setConsent("diagnostics", "granted");
    await client.setConsent("crashReports", "granted");
    client.track(RUN);
    await client.flush({ force: true });
    expect(client.getConsent().productAnalytics).toBe("unset");
    expect(transport.batches).toEqual([]);
  });

  it("drops events tracked before stored consent is known when it is absent", async () => {
    const transport = recordingTransport();
    const client = makeClient({ transport });
    client.track(RUN);
    await client.ready;
    await client.flush({ force: true });
    expect(transport.batches).toEqual([]);
  });

  it("clears leftovers from an earlier grant at startup", async () => {
    const store = createMemoryAnalyticsStore({
      consent: { ...DEFAULT_CONSENT, productAnalytics: "denied" },
      queue: [{ stale: true }],
      identity: {
        anonymousId: "3b241101-e2bb-4255-8caf-4136c566a962",
        createdAt: new Date().toISOString()
      }
    });
    const client = makeClient({ store });
    await client.ready;
    expect(store.snapshot().queue).toEqual([]);
    expect(store.snapshot().identity).toBeNull();
  });
});

describe("schema enforcement at runtime", () => {
  it("drops events whose shape escaped the type checker", async () => {
    const drops: string[] = [];
    const transport = recordingTransport();
    const client = makeClient({
      transport,
      store: createMemoryAnalyticsStore({ consent: GRANTED }),
      onDrop: (r) => drops.push(r)
    });
    await client.ready;
    const missingProperties: UntypedEvent = { event: "page_view", properties: {} };
    const extraProperty: UntypedEvent = {
      event: "workflow_run",
      properties: {
        executionMode: "local",
        nodeCountBucket: "6-20",
        workflowName: "My secret plan"
      }
    };
    // SAFETY: deliberately invalid events, proving runtime validation drops what the types would reject.
    client.track(missingProperties as AnalyticsEvent);
    // SAFETY: same, with a property the schema does not allow.
    client.track(extraProperty as AnalyticsEvent);
    await client.flush({ force: true });
    expect(transport.batches).toEqual([]);
    expect(drops).toEqual(["event_unknown", "properties_keys_mismatch"]);
  });

  it("revalidates a stored queue that was tampered with", async () => {
    const transport = recordingTransport();
    const client = makeClient({
      transport,
      store: createMemoryAnalyticsStore({
        consent: GRANTED,
        queue: [{ event: "workflow_run", cwd: "/home/alice" }]
      })
    });
    await client.ready;
    await client.flush({ force: true });
    expect(transport.batches).toEqual([]);
  });

  it("serializes only the envelope keys", async () => {
    const transport = recordingTransport();
    const client = makeClient({
      transport,
      store: createMemoryAnalyticsStore({ consent: GRANTED })
    });
    await client.ready;
    client.track(RUN);
    await client.flush();
    const sent = transport.batches[0]?.events[0];
    expect(Object.keys(sent ?? {})).toEqual([
      "schemaVersion",
      "event",
      "clientType",
      "anonymousId",
      "sessionId",
      "timestamp",
      "appVersion",
      "platform",
      "properties"
    ]);
    expect(sent?.timestamp).toMatch(/T\d{2}:00:00\.000Z$/);
  });
});

describe("identity", () => {
  it("uses a random anonymous ID unrelated to any account", async () => {
    const a = makeClient({ store: createMemoryAnalyticsStore({ consent: GRANTED }) });
    const b = makeClient({ store: createMemoryAnalyticsStore({ consent: GRANTED }) });
    await Promise.all([a.ready, b.ready]);
    a.track(RUN);
    b.track(RUN);
    const idA = a.pendingEvents()[0]?.anonymousId;
    const idB = b.pendingEvents()[0]?.anonymousId;
    expect(idA).toMatch(/^[0-9a-f-]{36}$/);
    expect(idA).not.toBe(idB);
    // The client API takes no account, email or user ID at all.
    expect(Object.keys(a)).not.toContain("identify");
  });

  it("rotates the anonymous ID after its lifetime", async () => {
    let time = new Date("2026-01-01T00:00:00Z").getTime();
    const store = createMemoryAnalyticsStore({ consent: GRANTED });
    const client = makeClient({ store, now: () => new Date(time) });
    await client.ready;
    client.track(RUN);
    const first = client.pendingEvents()[0]?.anonymousId;
    time += ANONYMOUS_ID_LIFETIME_MS + 1;
    client.track(RUN);
    const second = client.pendingEvents()[1]?.anonymousId;
    expect(second).not.toBe(first);
    expect(store.snapshot().identity?.anonymousId).toBe(second);
  });

  it("uses a new session ID per client instance", async () => {
    const store = createMemoryAnalyticsStore({ consent: GRANTED });
    const a = makeClient({ store });
    await a.ready;
    a.track(RUN);
    const b = makeClient({ store });
    await b.ready;
    b.track(RUN);
    // b also loads a's unsent event from the shared store, so compare b's own.
    const own = b.pendingEvents().at(-1);
    expect(a.pendingEvents()[0]?.sessionId).not.toBe(own?.sessionId);
    expect(a.pendingEvents()[0]?.anonymousId).toBe(own?.anonymousId);
  });

  it("gives backend events no identity at all", async () => {
    const transport = recordingTransport();
    const client = createAnalyticsClient({
      clientType: "cloud_backend",
      appVersion: "0.8.4",
      platform: "linux",
      store: createMemoryAnalyticsStore({ consent: GRANTED }),
      transport,
      flushDelayMs: null
    });
    await client.ready;
    client.track({
      event: "execution_started",
      properties: { executionMode: "cloud", feature: "workflow" }
    });
    await client.flush();
    expect(transport.batches[0]?.events[0]).toMatchObject({
      anonymousId: null,
      sessionId: null
    });
  });
});

describe("failure isolation", () => {
  it("never throws when the transport throws or rejects", async () => {
    const client = makeClient({
      store: createMemoryAnalyticsStore({ consent: GRANTED }),
      transport: {
        send: () => {
          throw new Error("network down");
        }
      }
    });
    await client.ready;
    expect(() => client.track(RUN)).not.toThrow();
    await expect(client.flush({ force: true })).resolves.toBeUndefined();
    await expect(client.endSession()).resolves.toBeUndefined();
  });

  it("never throws when storage fails", async () => {
    const broken: AnalyticsStore = {
      loadConsent: () => Promise.reject(new Error("disk")),
      saveConsent: () => Promise.reject(new Error("disk")),
      loadIdentity: () => Promise.reject(new Error("disk")),
      saveIdentity: () => Promise.reject(new Error("disk")),
      loadQueue: () => Promise.reject(new Error("disk")),
      saveQueue: () => Promise.reject(new Error("disk"))
    };
    const client = makeClient({ store: broken });
    await expect(client.ready).resolves.toBeUndefined();
    expect(client.isEnabled()).toBe(false);
    await expect(client.setConsent("productAnalytics", "granted")).resolves.toBeUndefined();
    expect(() => client.track(RUN)).not.toThrow();
  });

  it("keeps events while offline and sends them later", async () => {
    let online = false;
    const sent: AnalyticsBatch[] = [];
    let time = 0;
    const store = createMemoryAnalyticsStore({ consent: GRANTED });
    const client = makeClient({
      store,
      now: () => new Date(Date.UTC(2026, 0, 1) + time),
      transport: {
        send: async (batch) => {
          if (!online) return false;
          sent.push(batch);
          return true;
        }
      }
    });
    await client.ready;
    client.track(RUN);
    await client.flush();
    expect(sent).toEqual([]);
    expect(store.snapshot().queue).toHaveLength(1);

    // Backoff: an immediate retry is skipped.
    online = true;
    await client.flush();
    expect(sent).toEqual([]);

    time += 61_000;
    await client.flush();
    expect(sent).toHaveLength(1);
    expect(store.snapshot().queue).toEqual([]);
  });

  it("restores a persisted queue in a new session", async () => {
    const store = createMemoryAnalyticsStore({ consent: GRANTED });
    const first = makeClient({ store, transport: recordingTransport(false) });
    await first.ready;
    first.track(RUN);
    const transport = recordingTransport();
    const second = makeClient({ store, transport });
    await second.ready;
    await second.flush();
    expect(transport.batches[0]?.events).toHaveLength(1);
  });

  it("drops the oldest events when the queue is full", async () => {
    const client = makeClient({
      store: createMemoryAnalyticsStore({ consent: GRANTED }),
      transport: recordingTransport(false),
      maxQueue: 3
    });
    await client.ready;
    for (let i = 0; i < 5; i++) client.track(RUN);
    expect(client.pendingEvents()).toHaveLength(3);
  });

  it("does not keep a timer referenced", async () => {
    vi.useFakeTimers();
    try {
      const client = makeClient({
        store: createMemoryAnalyticsStore({ consent: GRANTED }),
        flushDelayMs: 1_000
      });
      await client.ready;
      client.track(RUN);
      expect(vi.getTimerCount()).toBe(1);
      client.shutdown();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("local aggregation", () => {
  it("summarizes the session as buckets", async () => {
    const transport = recordingTransport();
    const client = makeClient({
      transport,
      store: createMemoryAnalyticsStore({ consent: GRANTED })
    });
    await client.ready;
    for (let i = 0; i < 3; i++) client.track(RUN);
    client.track({ event: "workflow_created", properties: {} });
    await client.endSession();
    const events = transport.batches.flatMap((batch) => batch.events);
    expect(events.at(-1)).toMatchObject({
      event: "session_summary",
      properties: { workflowRuns: "2-5", workflowsCreated: "1" }
    });
  });

  it("does not count interactions before consent", async () => {
    const transport = recordingTransport();
    const client = makeClient({ transport });
    await client.ready;
    client.track(RUN);
    await client.setConsent("productAnalytics", "granted");
    await client.endSession();
    expect(transport.batches).toEqual([]);
  });
});

describe("inspection", () => {
  it("previews an envelope without queuing it", async () => {
    const client = makeClient();
    await client.ready;
    const preview = client.preview(RUN);
    expect(preview?.event).toBe("workflow_run");
    expect(client.pendingEvents()).toEqual([]);
  });

  it("lists recent events exactly as serialized", async () => {
    const transport = recordingTransport();
    const client = makeClient({
      transport,
      store: createMemoryAnalyticsStore({ consent: GRANTED })
    });
    await client.ready;
    client.track(RUN);
    await client.flush();
    expect(client.recentEvents()).toEqual(transport.batches[0]?.events);
  });
});
