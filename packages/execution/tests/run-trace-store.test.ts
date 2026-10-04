import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunTraceRegistration, RunTraceUpdate } from "@nodetool-ai/protocol";
import type { RunTraceStore } from "@nodetool-ai/runtime";

const bridge = vi.hoisted(() => ({
  configure: vi.fn(), init: vi.fn(), lookup: vi.fn(), get: vi.fn(), write: vi.fn(), incomplete: vi.fn()
}));
vi.mock("@nodetool-ai/runtime", () => ({ configureRunTraceStore: bridge.configure, initTelemetry: bridge.init }));
vi.mock("@nodetool-ai/models", () => ({
  getRegisteredTrace: bridge.lookup, getRunTrace: bridge.get,
  writeRunTraceUpdate: bridge.write, markRunTraceIncomplete: bridge.incomplete,
  sanitizeRunTraceRecord: (record: unknown) => record
}));
import { ensureRunTraceTelemetry, subscribeRunTraceUpdates } from "../src/run-trace-store.js";

const registration = {
  id: "1".repeat(32), user_id: "owner", trace_id: "2".repeat(32)
} as RunTraceRegistration;
const update: RunTraceUpdate = {
  kind: "span_ended",
  record: {
    trace_id: registration.trace_id, span_id: "3".repeat(16), parent_span_id: null,
    name: "app.run", kind: "INTERNAL", start_time_ms: 0, end_time_ms: 1,
    duration_ms: 1, status: { code: "OK" }, attributes: {}, resource: {}, events: []
  }
};
let adapter: RunTraceStore;

beforeAll(async () => {
  await ensureRunTraceTelemetry();
  adapter = bridge.configure.mock.calls[0]?.[0] as RunTraceStore;
});

beforeEach(() => {
  bridge.lookup.mockResolvedValue(registration);
  bridge.get.mockResolvedValue(registration);
  bridge.write.mockResolvedValue({ ...update, run_id: registration.id, cursor: 1, content_expired: false, truncated: false, incomplete: false });
});

describe("durable telemetry bridge", () => {
  it("publishes sanitized committed snapshots after awaited writes", async () => {
    const observed = vi.fn();
    const stop = subscribeRunTraceUpdates(observed);
    try {
      await adapter.write([{ userId: "owner", runId: registration.id, update, secretValues: new Set(["secret"]), contentSuppressed: false, isRoot: true }]);
      expect(bridge.write).toHaveBeenLastCalledWith("owner", registration.id, update, expect.objectContaining({ isRoot: true }));
      expect(observed).toHaveBeenCalledWith("owner", expect.objectContaining({ cursor: 1, run_id: registration.id }));
    } finally { stop(); }
  });

  it("never publishes rejected or unregistered writes", async () => {
    const observed = vi.fn();
    const stop = subscribeRunTraceUpdates(observed);
    try {
      bridge.write.mockResolvedValueOnce(null);
      await adapter.write([{ update, secretValues: new Set(), contentSuppressed: false, isRoot: false }]);
      bridge.lookup.mockResolvedValueOnce(null);
      await adapter.write([{ update, secretValues: new Set(), contentSuppressed: false, isRoot: false }]);
      expect(observed).not.toHaveBeenCalled();
    } finally { stop(); }
  });

  it("marks storage failures against the registered owner", async () => {
    await adapter.markIncomplete(registration.trace_id, "store_failure");
    expect(bridge.incomplete).toHaveBeenCalledWith("owner", registration.trace_id, "store_failure");
  });
});
