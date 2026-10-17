import { describe, expect, it } from "vitest";
import {
  ANALYTICS_EVENTS,
  ANALYTICS_EVENT_NAMES,
  ANALYTICS_SCHEMA_VERSION,
  MAX_BATCH_EVENTS,
  bucketCount,
  bucketDuration,
  bucketNodeCount,
  categorizeError,
  isForbiddenFieldName,
  validateBatch,
  validateEnvelope,
  type AnalyticsEnvelope
} from "../src/index.js";

const ANON = "3b241101-e2bb-4255-8caf-4136c566a962";
const SESSION = "6fa459ea-ee8a-4ca4-894e-db77e160355e";

const envelope = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  schemaVersion: ANALYTICS_SCHEMA_VERSION,
  event: "workflow_run",
  clientType: "local_desktop",
  anonymousId: ANON,
  sessionId: SESSION,
  timestamp: "2026-10-17T21:00:00.000Z",
  appVersion: "0.8.4",
  platform: "macos",
  properties: { executionMode: "local", nodeCountBucket: "6-20" },
  ...overrides
});

const reason = (value: unknown): string => {
  const result = validateEnvelope(value);
  return result.ok ? "ok" : result.reason;
};

describe("validateEnvelope", () => {
  it("accepts a well-formed envelope", () => {
    expect(reason(envelope())).toBe("ok");
  });

  it("rejects an event name outside the table", () => {
    expect(reason(envelope({ event: "button_clicked" }))).toBe("event_unknown");
  });

  it("rejects unexpected envelope fields", () => {
    expect(reason(envelope({ extra: "x" }))).toBe("envelope_keys_mismatch");
  });

  it("rejects unexpected and missing properties", () => {
    expect(
      reason(
        envelope({
          properties: { executionMode: "local", nodeCountBucket: "6-20", nodes: "3" }
        })
      )
    ).toBe("properties_keys_mismatch");
    expect(reason(envelope({ properties: { executionMode: "local" } }))).toBe(
      "properties_keys_mismatch"
    );
  });

  it("rejects exact numbers and free text where a bucket is expected", () => {
    expect(
      reason(envelope({ properties: { executionMode: "local", nodeCountBucket: 37 } }))
    ).toBe("property_value_not_allowed:nodeCountBucket");
    expect(
      reason(
        envelope({ properties: { executionMode: "local", nodeCountBucket: "37" } })
      )
    ).toBe("property_value_not_allowed:nodeCountBucket");
  });

  it("rejects forbidden fields anywhere in the payload", () => {
    expect(reason(envelope({ userId: "u1" }))).toBe("forbidden_field:userId");
    expect(
      reason(
        envelope({
          properties: { executionMode: "local", nodeCountBucket: "6-20", prompt: "hi" }
        })
      )
    ).toBe("forbidden_field:prompt");
    expect(
      reason(
        envelope({
          properties: {
            executionMode: "local",
            nodeCountBucket: "6-20",
            nested: { workflow_id: "abc" }
          }
        })
      )
    ).toBe("forbidden_field:workflow_id");
  });

  it("validates the schema version", () => {
    expect(reason(envelope({ schemaVersion: 2 }))).toBe("schema_version_unsupported");
    expect(reason(envelope({ schemaVersion: "1" }))).toBe("schema_version_unsupported");
  });

  it("requires random UUIDs for client identity", () => {
    expect(reason(envelope({ anonymousId: "user@example.com" }))).toBe(
      "anonymous_id_invalid"
    );
    expect(reason(envelope({ anonymousId: "a".repeat(64) }))).toBe(
      "anonymous_id_invalid"
    );
    expect(reason(envelope({ sessionId: null }))).toBe("session_id_invalid");
  });

  it("forbids any identity on backend events", () => {
    const backend = envelope({
      event: "execution_started",
      clientType: "cloud_backend",
      platform: "linux",
      properties: { executionMode: "cloud", feature: "workflow" }
    });
    expect(reason({ ...backend, anonymousId: null, sessionId: null })).toBe("ok");
    expect(reason(backend)).toBe("backend_identity_not_allowed");
  });

  it("rejects events a client may not emit", () => {
    expect(
      reason(
        envelope({
          event: "execution_started",
          properties: { executionMode: "cloud", feature: "workflow" }
        })
      )
    ).toBe("event_not_allowed_for_client");
    expect(
      reason(
        envelope({
          event: "workflow_run",
          clientType: "cloud_backend",
          anonymousId: null,
          sessionId: null
        })
      )
    ).toBe("event_not_allowed_for_client");
  });

  it("only accepts hour-truncated timestamps", () => {
    expect(reason(envelope({ timestamp: "2026-10-17T21:13:07.000Z" }))).toBe(
      "timestamp_invalid"
    );
    const now = new Date("2026-10-17T21:30:00Z");
    expect(
      validateEnvelope(envelope({ timestamp: "2026-10-18T03:00:00.000Z" }), { now })
        .ok
    ).toBe(false);
    expect(
      validateEnvelope(envelope({ timestamp: "2026-09-01T03:00:00.000Z" }), {
        now,
        maxAgeMs: 7 * 24 * 3_600_000
      }).ok
    ).toBe(false);
  });

  it("rejects free-form versions and platforms", () => {
    expect(reason(envelope({ appVersion: "0.8.4 (/home/alice/nodetool)" }))).toBe(
      "app_version_invalid"
    );
    expect(reason(envelope({ platform: "Mozilla/5.0" }))).toBe("platform_unknown");
  });

  it("rejects non-plain objects", () => {
    expect(reason([envelope()])).toBe("envelope_not_object");
    expect(reason("{}")).toBe("envelope_not_object");
  });
});

describe("validateBatch", () => {
  it("rejects one bad event in a batch", () => {
    const result = validateBatch({
      schemaVersion: 1,
      events: [envelope(), envelope({ event: "keypress" })]
    });
    expect(result).toEqual({ ok: false, reason: "event_1:event_unknown" });
  });

  it("caps the batch size and requires the exact batch keys", () => {
    const events = Array.from({ length: MAX_BATCH_EVENTS + 1 }, () => envelope());
    expect(validateBatch({ schemaVersion: 1, events }).ok).toBe(false);
    expect(validateBatch({ schemaVersion: 1, events: [envelope()], ip: "1.2.3.4" }).ok)
      .toBe(false);
  });
});

describe("event table", () => {
  it("uses no forbidden property names", () => {
    for (const name of ANALYTICS_EVENT_NAMES) {
      for (const key of Object.keys(ANALYTICS_EVENTS[name].properties)) {
        expect(isForbiddenFieldName(key), `${name}.${key}`).toBe(false);
      }
    }
  });

  it("gives every property a small closed set of values", () => {
    for (const name of ANALYTICS_EVENT_NAMES) {
      for (const values of Object.values(
        ANALYTICS_EVENTS[name].properties as Record<string, readonly string[]>
      )) {
        expect(values.length).toBeGreaterThan(0);
        expect(values.length).toBeLessThanOrEqual(30);
      }
    }
  });

  it("type-checks events at compile time", () => {
    const ok: AnalyticsEnvelope["event"] = "workflow_run";
    expect(ok).toBe("workflow_run");
  });
});

describe("bucketing", () => {
  it("buckets counts and durations", () => {
    expect(bucketNodeCount(0)).toBe("0");
    expect(bucketNodeCount(37)).toBe("21-100");
    expect(bucketNodeCount(500)).toBe("101+");
    expect(bucketDuration(18_342)).toBe("10-30s");
    expect(bucketDuration(Number.NaN)).toBe("<1s");
    expect(bucketCount(3)).toBe("2-5");
  });

  it("categorizes errors without keeping the message", () => {
    expect(categorizeError(new Error("OpenAI API key is missing"))).toBe(
      "missing_secret"
    );
    expect(categorizeError(new Error("Request timed out"))).toBe("timeout");
    expect(categorizeError(new Error("429 rate limit"))).toBe("provider");
    expect(categorizeError(new Error("Something odd"))).toBe("runtime");
    expect(categorizeError(undefined)).toBe("unknown");
  });
});
