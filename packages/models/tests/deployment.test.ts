import { describe, it, expect, beforeEach, vi } from "vitest";

import { initTestDb } from "../src/db.js";
import { Deployment, DeploymentConflictError } from "../src/deployment.js";

describe("Deployment model", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("inserts and retrieves by (user_id, name)", async () => {
    await Deployment.upsert({
      user_id: "u1",
      name: "prod",
      type: "runpod",
      config_json: JSON.stringify({ x: 1 })
    });

    const fetched = await Deployment.findByName("u1", "prod");
    expect(fetched).not.toBeNull();
    expect(fetched!.user_id).toBe("u1");
    expect(fetched!.name).toBe("prod");
    expect(fetched!.type).toBe("runpod");
    expect(JSON.parse(fetched!.config_json)).toEqual({ x: 1 });
    expect(fetched!.etag).toBeTruthy();
  });

  it("isolates rows across users with the same deployment name", async () => {
    await Deployment.upsert({
      user_id: "alice",
      name: "prod",
      type: "runpod",
      config_json: JSON.stringify({ owner: "alice" })
    });
    await Deployment.upsert({
      user_id: "bob",
      name: "prod",
      type: "runpod",
      config_json: JSON.stringify({ owner: "bob" })
    });

    const alice = await Deployment.findByName("alice", "prod");
    const bob = await Deployment.findByName("bob", "prod");
    expect(JSON.parse(alice!.config_json).owner).toBe("alice");
    expect(JSON.parse(bob!.config_json).owner).toBe("bob");

    expect((await Deployment.listForUser("alice")).map((r) => r.name)).toEqual([
      "prod"
    ]);
    expect((await Deployment.listForUser("bob")).map((r) => r.name)).toEqual([
      "prod"
    ]);
  });

  it("upsert updates existing row by (user_id, name)", async () => {
    await Deployment.upsert({
      user_id: "u1",
      name: "prod",
      type: "runpod",
      config_json: JSON.stringify({ v: 1 })
    });
    const v1 = await Deployment.findByName("u1", "prod");

    await Deployment.upsert({
      user_id: "u1",
      name: "prod",
      type: "runpod",
      config_json: JSON.stringify({ v: 2 })
    });
    const v2 = await Deployment.findByName("u1", "prod");

    expect(v1!.id).toBe(v2!.id);
    expect(JSON.parse(v2!.config_json).v).toBe(2);
    expect(v2!.etag).not.toBe(v1!.etag);
  });

  it("writeState patches state_json without touching config_json", async () => {
    await Deployment.upsert({
      user_id: "u1",
      name: "prod",
      type: "runpod",
      config_json: JSON.stringify({ image: "x:1" }),
      state_json: JSON.stringify({ status: "unknown" })
    });

    await Deployment.writeState(
      "u1",
      "prod",
      JSON.stringify({ status: "running" })
    );
    const row = await Deployment.findByName("u1", "prod");
    expect(JSON.parse(row!.state_json).status).toBe("running");
    expect(JSON.parse(row!.config_json).image).toBe("x:1");
  });

  it("writeState throws for unknown deployment", async () => {
    await expect(
      Deployment.writeState("u1", "ghost", "{}")
    ).rejects.toThrow(/not found/);
  });

  it("remove deletes a single row", async () => {
    await Deployment.upsert({
      user_id: "u1",
      name: "prod",
      type: "runpod",
      config_json: "{}"
    });
    expect(await Deployment.remove("u1", "prod")).toBe(true);
    expect(await Deployment.findByName("u1", "prod")).toBeNull();
    expect(await Deployment.remove("u1", "prod")).toBe(false);
  });

  it("DeploymentConflictError carries user_id and deployment name", () => {
    const err = new DeploymentConflictError("alice", "prod");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("DeploymentConflictError");
    expect(err.user_id).toBe("alice");
    expect(err.deploymentName).toBe("prod");
  });

  describe("optimistic concurrency (etag/updated_at CAS)", () => {
    async function seed(): Promise<Deployment> {
      await Deployment.upsert({
        user_id: "u1",
        name: "prod",
        type: "runpod",
        config_json: JSON.stringify({ image: "x:1" }),
        state_json: JSON.stringify({ status: "unknown" })
      });
      const row = await Deployment.findByName("u1", "prod");
      return row!;
    }

    it("two racing state writes: one wins, the stale one throws DeploymentConflictError", async () => {
      const row = await seed();
      // Both writers captured the SAME updated_at token; this models a race
      // where two callers read the row, then each tries to commit.
      const staleToken = row.updated_at;

      // Writer A wins the CAS.
      const winner = await Deployment.writeStateIfUnchanged(
        "u1",
        "prod",
        staleToken,
        JSON.stringify({ status: "running" }),
        row.config_json
      );
      expect(winner).not.toBeNull();

      // Writer B replays the SAME (now stale) token and loses the CAS: the
      // low-level primitive returns null rather than overwriting.
      const loser = await Deployment.writeStateIfUnchanged(
        "u1",
        "prod",
        staleToken,
        JSON.stringify({ status: "stopped" }),
        row.config_json
      );
      expect(loser).toBeNull();

      // The winner's write survived.
      const after = await Deployment.findByName("u1", "prod");
      expect(JSON.parse(after!.state_json).status).toBe("running");
    });

    it("writeStateIfUnchanged never clobbers config_json", async () => {
      const row = await seed();
      await Deployment.writeStateIfUnchanged(
        "u1",
        "prod",
        row.updated_at,
        JSON.stringify({ status: "running" }),
        row.config_json
      );
      const after = await Deployment.findByName("u1", "prod");
      // state moved on, config is untouched.
      expect(JSON.parse(after!.state_json).status).toBe("running");
      expect(JSON.parse(after!.config_json).image).toBe("x:1");
    });

    it("writeState self-heals against a concurrent disjoint write via retry", async () => {
      // writeState re-reads the token inside a bounded retry loop, so a
      // benign interleaving does NOT surface a conflict to the caller.
      await seed();
      await Deployment.writeState(
        "u1",
        "prod",
        JSON.stringify({ status: "applied" })
      );
      const after = await Deployment.findByName("u1", "prod");
      expect(JSON.parse(after!.state_json).status).toBe("applied");
    });

    it("mutateState re-merges concurrent disjoint state fields instead of dropping them", async () => {
      await seed();
      // First mutation sets status; second sets pod_id. Because each mutation
      // re-reads inside the CAS loop, both fields survive (no last-writer-wins
      // drop of the disjoint field).
      await Deployment.mutateState("u1", "prod", (state) => ({
        ...state,
        status: "running"
      }));
      const merged = await Deployment.mutateState("u1", "prod", (state) => ({
        ...state,
        pod_id: "pod-123"
      }));
      expect(merged.status).toBe("running");
      expect(merged.pod_id).toBe("pod-123");

      const after = await Deployment.findByName("u1", "prod");
      const state = JSON.parse(after!.state_json);
      expect(state.status).toBe("running");
      expect(state.pod_id).toBe("pod-123");
    });

    it("bumps the CAS token (updated_at) on every state write", async () => {
      const row = await seed();
      const updated = await Deployment.writeStateIfUnchanged(
        "u1",
        "prod",
        row.updated_at,
        JSON.stringify({ status: "running" }),
        row.config_json
      );
      expect(updated).not.toBeNull();
      // The token strictly advances so a subsequent stale replay is detectable
      // even when the wall clock has not moved.
      expect(updated!.updated_at).not.toBe(row.updated_at);
      expect(Date.parse(updated!.updated_at)).toBeGreaterThanOrEqual(
        Date.parse(row.updated_at)
      );
    });

    it("writeState throws DeploymentConflictError under sustained contention", async () => {
      await seed();
      // Simulate a perpetually-losing CAS: every swap attempt sees the row
      // already moved on. After the bounded retries are exhausted, writeState
      // surfaces a DeploymentConflictError to the caller.
      const spy = vi
        .spyOn(Deployment, "writeStateIfUnchanged")
        .mockResolvedValue(null);
      try {
        await expect(
          Deployment.writeState(
            "u1",
            "prod",
            JSON.stringify({ status: "running" })
          )
        ).rejects.toBeInstanceOf(DeploymentConflictError);
      } finally {
        spy.mockRestore();
      }
    });

    it("mutateState throws DeploymentConflictError under sustained contention", async () => {
      await seed();
      const spy = vi
        .spyOn(Deployment, "writeStateIfUnchanged")
        .mockResolvedValue(null);
      try {
        await expect(
          Deployment.mutateState("u1", "prod", (s) => ({ ...s, x: 1 }), 3)
        ).rejects.toBeInstanceOf(DeploymentConflictError);
      } finally {
        spy.mockRestore();
      }
    });

    it("a config upsert and an independent state write do not false-conflict", async () => {
      const row = await seed();
      // State write moves the token.
      await Deployment.writeState(
        "u1",
        "prod",
        JSON.stringify({ status: "running" })
      );
      // A config upsert re-reads inside its retry loop and still succeeds,
      // preserving the concurrently-written state.
      await Deployment.upsert({
        user_id: "u1",
        name: "prod",
        type: "runpod",
        config_json: JSON.stringify({ image: "x:2" })
      });
      const after = await Deployment.findByName("u1", "prod");
      expect(JSON.parse(after!.config_json).image).toBe("x:2");
      expect(JSON.parse(after!.state_json).status).toBe("running");
      expect(after!.id).toBe(row.id);
    });
  });

  it("removeAllForUser bulk-deletes only that user's rows", async () => {
    await Deployment.upsert({
      user_id: "u1",
      name: "a",
      type: "runpod",
      config_json: "{}"
    });
    await Deployment.upsert({
      user_id: "u1",
      name: "b",
      type: "runpod",
      config_json: "{}"
    });
    await Deployment.upsert({
      user_id: "u2",
      name: "c",
      type: "runpod",
      config_json: "{}"
    });

    expect(await Deployment.removeAllForUser("u1")).toBe(2);
    expect(await Deployment.listForUser("u1")).toEqual([]);
    expect(await Deployment.listForUser("u2")).toHaveLength(1);
  });
});
