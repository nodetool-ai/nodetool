/**
 * Tests for the RunLease model.
 *
 * Covers: acquire, renew, release, isExpired, isHeldBy, cleanupExpired.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { RunLease } from "../src/run-lease.js";

// ── Setup ────────────────────────────────────────────────────────────

describe("RunLease model", () => {
  beforeEach(() => {
    initTestDb();
  });

  afterEach(() => {
    ModelObserver.clear();
  });

  // ── acquire ───────────────────────────────────────────────────────

  it("acquires a lease on a new run", async () => {
    const lease = await RunLease.acquire("r1", "w1");
    expect(lease).not.toBeNull();
    expect(lease!.run_id).toBe("r1");
    expect(lease!.worker_id).toBe("w1");
    expect(lease!.acquired_at).toBeTruthy();
    expect(lease!.expires_at).toBeTruthy();
  });

  it("returns null when lease already held by another worker", async () => {
    await RunLease.acquire("r1", "w1", 60);
    const second = await RunLease.acquire("r1", "w2", 60);
    expect(second).toBeNull();
  });

  it("allows acquiring an expired lease", async () => {
    // Create a lease that expires immediately
    const lease = await RunLease.acquire("r1", "w1", 0);
    expect(lease).not.toBeNull();

    // Wait a bit to ensure expiration
    await new Promise((r) => setTimeout(r, 10));

    const newLease = await RunLease.acquire("r1", "w2", 60);
    expect(newLease).not.toBeNull();
    expect(newLease!.worker_id).toBe("w2");
  });

  it("sets expires_at based on ttlSeconds", async () => {
    const before = Date.now();
    const lease = await RunLease.acquire("r1", "w1", 120);
    const after = Date.now();

    const expiresMs = new Date(lease!.expires_at).getTime();
    // expires_at should be ~120s from now
    expect(expiresMs).toBeGreaterThanOrEqual(before + 119000);
    expect(expiresMs).toBeLessThanOrEqual(after + 121000);
  });

  // ── renew ─────────────────────────────────────────────────────────

  it("extends the lease expiration", async () => {
    const lease = await RunLease.acquire("r1", "w1", 10);
    const originalExpiry = lease!.expires_at;

    await new Promise((r) => setTimeout(r, 5));
    await lease!.renew(300);

    expect(new Date(lease!.expires_at).getTime()).toBeGreaterThan(
      new Date(originalExpiry).getTime()
    );
  });

  it("persists renewal to database", async () => {
    const lease = await RunLease.acquire("r1", "w1", 10);
    await lease!.renew(600);

    const loaded = await RunLease.get<RunLease>("r1");
    expect(loaded).not.toBeNull();
    expect(new Date(loaded!.expires_at).getTime()).toBeGreaterThan(
      Date.now() + 500000
    );
  });

  // ── release ───────────────────────────────────────────────────────

  it("removes the lease from database", async () => {
    const lease = await RunLease.acquire("r1", "w1");
    await lease!.release();

    const loaded = await RunLease.get<RunLease>("r1");
    expect(loaded).toBeNull();
  });

  it("allows re-acquisition after release", async () => {
    const lease = await RunLease.acquire("r1", "w1");
    await lease!.release();

    const newLease = await RunLease.acquire("r1", "w2");
    expect(newLease).not.toBeNull();
    expect(newLease!.worker_id).toBe("w2");
  });

  // ── isExpired ─────────────────────────────────────────────────────

  it("returns false for a fresh lease", async () => {
    const lease = await RunLease.acquire("r1", "w1", 60);
    expect(lease!.isExpired()).toBe(false);
  });

  it("returns true for an expired lease", async () => {
    const lease = await RunLease.acquire("r1", "w1", 0);
    await new Promise((r) => setTimeout(r, 10));
    expect(lease!.isExpired()).toBe(true);
  });

  // ── isHeldBy ──────────────────────────────────────────────────────

  it("returns true for the holding worker", async () => {
    const lease = await RunLease.acquire("r1", "w1", 60);
    expect(lease!.isHeldBy("w1")).toBe(true);
  });

  it("returns false for a different worker", async () => {
    const lease = await RunLease.acquire("r1", "w1", 60);
    expect(lease!.isHeldBy("w2")).toBe(false);
  });

  it("returns false if expired even for correct worker", async () => {
    const lease = await RunLease.acquire("r1", "w1", 0);
    await new Promise((r) => setTimeout(r, 10));
    expect(lease!.isHeldBy("w1")).toBe(false);
  });

  // ── cleanupExpired ────────────────────────────────────────────────

  it("removes expired leases", async () => {
    await RunLease.acquire("r1", "w1", 0);
    await RunLease.acquire("r2", "w2", 0);
    await new Promise((r) => setTimeout(r, 10));

    const count = await RunLease.cleanupExpired();
    expect(count).toBe(2);

    const remaining1 = await RunLease.get<RunLease>("r1");
    const remaining2 = await RunLease.get<RunLease>("r2");
    expect(remaining1).toBeNull();
    expect(remaining2).toBeNull();
  });

  it("does not remove active leases", async () => {
    await RunLease.acquire("r1", "w1", 600);
    await RunLease.acquire("r2", "w2", 0);
    await new Promise((r) => setTimeout(r, 10));

    const count = await RunLease.cleanupExpired();
    expect(count).toBe(1);

    const active = await RunLease.get<RunLease>("r1");
    expect(active).not.toBeNull();
  });

  it("returns 0 when no expired leases exist", async () => {
    await RunLease.acquire("r1", "w1", 600);
    const count = await RunLease.cleanupExpired();
    expect(count).toBe(0);
  });

  // ── concurrency & edge cases ──────────────────────────────────────

  it("returns null when the same worker re-acquires its own valid lease", async () => {
    // acquire() is not idempotent for the holder — a worker extending its hold
    // must call renew(). A second acquire() while the lease is valid returns
    // null even for the same worker.
    const first = await RunLease.acquire("r1", "w1", 60);
    expect(first).not.toBeNull();
    const again = await RunLease.acquire("r1", "w1", 60);
    expect(again).toBeNull();
  });

  it("lets exactly one of two racing acquires win", async () => {
    const [a, b] = await Promise.all([
      RunLease.acquire("r1", "w1", 60),
      RunLease.acquire("r1", "w2", 60)
    ]);
    const winners = [a, b].filter((l) => l !== null);
    expect(winners).toHaveLength(1);
    // The losing acquire gets null; the DB holds exactly one lease for the run.
    const stored = await RunLease.get<RunLease>("r1");
    expect(stored).not.toBeNull();
    expect(stored!.worker_id).toBe(winners[0]!.worker_id);
  });

  it("reclaiming an expired lease keeps run_id and refreshes timestamps", async () => {
    const original = await RunLease.acquire("r1", "w1", 0);
    expect(original).not.toBeNull();
    await new Promise((r) => setTimeout(r, 10));

    const reclaimed = await RunLease.acquire("r1", "w2", 60);
    expect(reclaimed).not.toBeNull();
    expect(reclaimed!.run_id).toBe("r1");
    expect(reclaimed!.worker_id).toBe("w2");
    expect(new Date(reclaimed!.expires_at).getTime()).toBeGreaterThan(
      new Date(original!.expires_at).getTime()
    );

    // Only one row remains for the run after reclamation.
    const stored = await RunLease.get<RunLease>("r1");
    expect(stored!.worker_id).toBe("w2");
  });

  it("cleanupExpired removes only the expired subset", async () => {
    await RunLease.acquire("active", "w1", 600);
    await RunLease.acquire("dead1", "w2", 0);
    await RunLease.acquire("dead2", "w3", 0);
    await new Promise((r) => setTimeout(r, 10));

    const count = await RunLease.cleanupExpired();
    expect(count).toBe(2);
    expect(await RunLease.get<RunLease>("active")).not.toBeNull();
    expect(await RunLease.get<RunLease>("dead1")).toBeNull();
    expect(await RunLease.get<RunLease>("dead2")).toBeNull();
  });
});
