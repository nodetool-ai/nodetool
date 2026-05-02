import { describe, it, expect, beforeEach } from "vitest";

import { initTestDb } from "../src/db.js";
import { Deployment } from "../src/deployment.js";

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
