import { beforeEach, describe, expect, it, vi } from "vitest";

const model = vi.hoisted(() => ({
  owners: vi.fn(),
  settings: vi.fn(),
  cleanup: vi.fn(),
  upsert: vi.fn()
}));
vi.mock("@nodetool-ai/models", () => ({
  listRunTraceOwners: model.owners,
  Setting: { listForUser: model.settings, upsert: model.upsert },
  cleanupStorage: model.cleanup,
  DEFAULT_STORAGE_RETENTION_POLICY: {
    maxAutosavesPerWorkflow: 20,
    autosaveRetentionDays: 30,
    manualVersionRetentionDays: 365,
    terminalJobRetentionDays: 30,
    runEventRetentionDays: 30,
    runTraceRetentionDays: 30,
    predictionRetentionDays: 400,
    automaticCleanup: true
  }
}));
import { runScheduledStorageCleanup } from "../src/storage-retention.js";

beforeEach(() => {
  vi.clearAllMocks();
  model.owners.mockResolvedValue(["owner-a", "owner-b", "1"]);
  model.settings.mockResolvedValue([]);
  model.cleanup.mockImplementation(async (_userId: string, _policy: unknown, now: Date) => ({
    total: 2, completedAt: now.toISOString()
  }));
  model.upsert.mockResolvedValue(undefined);
});

describe("scheduled storage retention", () => {
  it("sweeps inactive hosted trace owners and the local owner once", async () => {
    const now = new Date("2026-10-04T00:00:00Z");
    const result = await runScheduledStorageCleanup("1", now);
    expect(model.cleanup.mock.calls.map((call) => call[0])).toEqual(["1", "owner-a", "owner-b"]);
    expect(result).toEqual({ total: 6, owners: 3 });
    expect(model.cleanup).toHaveBeenCalledWith("owner-a", expect.objectContaining({ runTraceRetentionDays: 30 }), now);
    expect(model.upsert).toHaveBeenCalledWith(expect.objectContaining({
      userId: "owner-b", key: "storage.retention.lastCleanupAt", value: now.toISOString()
    }));
  });

  it("continues sweeping other owners when one account fails", async () => {
    model.cleanup.mockRejectedValueOnce(new Error("Storage unavailable"));
    await expect(runScheduledStorageCleanup("1")).rejects.toThrow("Scheduled history cleanup failed");
    expect(model.cleanup.mock.calls.map((call) => call[0])).toEqual(["1", "owner-a", "owner-b"]);
    expect(model.upsert).toHaveBeenCalledWith(expect.objectContaining({ userId: "owner-b" }));
  });

  it("honors a recent sweep and an explicit manual cleanup policy", async () => {
    model.settings.mockImplementation(async (userId: string) => userId === "owner-a"
      ? [{ key: "storage.retention.lastCleanupAt", value: "2026-10-03T23:00:00Z" }]
      : [{ key: "storage.retention.automaticCleanup", value: "false" }]);
    expect(await runScheduledStorageCleanup("1", new Date("2026-10-04T00:00:00Z"))).toEqual({ total: 0, owners: 3 });
    expect(model.cleanup).not.toHaveBeenCalled();
  });
});
