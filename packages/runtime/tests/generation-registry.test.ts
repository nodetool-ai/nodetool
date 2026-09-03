import { describe, it, expect, beforeEach } from "vitest";
import { generationRegistry } from "../src/generation-registry.js";

describe("generationRegistry", () => {
  beforeEach(() => generationRegistry.reset());

  it("cancels only the owner's running generation", () => {
    let aborted = 0;
    generationRegistry.register("g1", { userId: "u1", abort: () => aborted++ });
    expect(generationRegistry.cancel("g1", "u2")).toBe(false);
    expect(generationRegistry.cancel("nope", "u1")).toBe(false);
    expect(generationRegistry.cancel("g1", "u1")).toBe(true);
    expect(aborted).toBe(1);
  });

  it("resolves waiters on settle and keeps the outcome for a late wait", async () => {
    generationRegistry.register("g2", { userId: "u1", abort: () => {} });
    const pending = generationRegistry.wait("g2", 5_000);
    generationRegistry.settle("g2", {
      status: "completed",
      asset_ids: ["a1"],
      receipt: null
    });
    expect(await pending).toEqual({
      status: "completed",
      asset_ids: ["a1"],
      receipt: null
    });
    expect(generationRegistry.isRunning("g2")).toBe(false);
    expect((await generationRegistry.wait("g2", 10))?.asset_ids).toEqual([
      "a1"
    ]);
  });

  it("returns null on timeout and for an unknown id", async () => {
    generationRegistry.register("g3", { userId: "u1", abort: () => {} });
    expect(await generationRegistry.wait("g3", 20)).toBeNull();
    expect(await generationRegistry.wait("unknown", 20)).toBeNull();
    // A timed-out waiter is dropped, so a later settle does not leak.
    generationRegistry.settle("g3", {
      status: "failed",
      error: "x",
      asset_ids: [],
      receipt: null
    });
    expect(generationRegistry.outcome("g3")?.status).toBe("failed");
  });

  it("lists running ids per user", () => {
    generationRegistry.register("a", { userId: "u1", abort: () => {} });
    generationRegistry.register("b", { userId: "u2", abort: () => {} });
    expect(generationRegistry.runningFor("u1")).toEqual(["a"]);
  });

  describe("completedSince", () => {
    const settle = (
      id: string,
      userId: string,
      outcome: Partial<{ status: string; asset_ids: string[] }> = {}
    ): void => {
      generationRegistry.register(id, { userId, abort: () => {} });
      generationRegistry.settle(id, {
        // Safety: the test names one of the statuses the union carries.
        status: (outcome.status ?? "completed") as "completed",
        asset_ids: outcome.asset_ids ?? [`asset-${id}`],
        receipt: null
      });
    };

    it("reports the user's completed generations with their assets", () => {
      const before = Date.now();
      settle("g-a", "u1");
      settle("g-b", "u1");
      expect(generationRegistry.completedSince("u1", before)).toEqual([
        { id: "g-a", asset_ids: ["asset-g-a"] },
        { id: "g-b", asset_ids: ["asset-g-b"] }
      ]);
    });

    it("leaves out another user's, a failure, and one with no assets", () => {
      const before = Date.now();
      settle("g-other", "u2");
      settle("g-failed", "u1", { status: "failed" });
      settle("g-empty", "u1", { asset_ids: [] });
      expect(generationRegistry.completedSince("u1", before)).toEqual([]);
    });

    it("leaves out one that settled before the window", () => {
      settle("g-old", "u1");
      expect(generationRegistry.completedSince("u1", Date.now() + 1)).toEqual(
        []
      );
    });
  });
});
