import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import {
  createWorkerProfile,
  getWorkerProfile,
  listWorkerProfiles,
  updateWorkerProfile,
  deleteWorkerProfile
} from "../src/worker-profiles.js";

/**
 * Task B2 — profile CRUD accessors over the worker_profiles table.
 */
describe("worker profile accessors", () => {
  beforeEach(() => {
    initTestDb();
  });
  afterEach(() => ModelObserver.clear());

  function makeInput(name = "hf-a40") {
    return {
      name,
      target: "runpod",
      image: "ghcr.io/nodetool/worker:0.7.3",
      spec: { gpu: "A40", vcpu: 8, env: { FOO: "bar" } },
      token_policy: "generate",
      idle_timeout_minutes: 30,
      max_lifetime_minutes: 240
    };
  }

  it("createWorkerProfile persists and returns the profile", async () => {
    const profile = await createWorkerProfile(makeInput());

    expect(profile.id).toBeTruthy();
    expect(profile.name).toBe("hf-a40");
    expect(profile.target).toBe("runpod");
    expect(profile.image).toBe("ghcr.io/nodetool/worker:0.7.3");
    expect(profile.spec).toEqual({ gpu: "A40", vcpu: 8, env: { FOO: "bar" } });
    expect(profile.token_policy).toBe("generate");
    expect(profile.idle_timeout_minutes).toBe(30);
    expect(profile.max_lifetime_minutes).toBe(240);
    expect(profile.created_at).toBeTruthy();
    expect(profile.updated_at).toBeTruthy();
  });

  it("getWorkerProfile returns a stored profile with parsed spec", async () => {
    await createWorkerProfile(makeInput());

    const found = await getWorkerProfile("hf-a40");
    expect(found).not.toBeNull();
    expect(found!.name).toBe("hf-a40");
    expect(found!.spec).toEqual({ gpu: "A40", vcpu: 8, env: { FOO: "bar" } });
  });

  it("getWorkerProfile returns null when missing", async () => {
    const found = await getWorkerProfile("does-not-exist");
    expect(found).toBeNull();
  });

  it("listWorkerProfiles returns all profiles", async () => {
    await createWorkerProfile(makeInput("a"));
    await createWorkerProfile(makeInput("b"));

    const all = await listWorkerProfiles();
    expect(all.map((p) => p.name).sort()).toEqual(["a", "b"]);
  });

  it("updateWorkerProfile mutates fields and bumps updated_at", async () => {
    const created = await createWorkerProfile(makeInput());
    // Ensure the timestamp clock advances.
    await new Promise((resolve) => setTimeout(resolve, 5));

    const updated = await updateWorkerProfile("hf-a40", {
      image: "ghcr.io/nodetool/worker:0.8.0",
      idle_timeout_minutes: 60,
      spec: { gpu: "A100" }
    });

    expect(updated.image).toBe("ghcr.io/nodetool/worker:0.8.0");
    expect(updated.idle_timeout_minutes).toBe(60);
    expect(updated.spec).toEqual({ gpu: "A100" });
    expect(updated.created_at).toBe(created.created_at);
    expect(
      new Date(updated.updated_at).getTime()
    ).toBeGreaterThan(new Date(created.updated_at).getTime());
  });

  it("updateWorkerProfile throws when the profile is missing", async () => {
    await expect(
      updateWorkerProfile("missing", { image: "x" })
    ).rejects.toThrow(/missing/);
  });

  it("deleteWorkerProfile removes the profile", async () => {
    await createWorkerProfile(makeInput());
    await deleteWorkerProfile("hf-a40");
    expect(await getWorkerProfile("hf-a40")).toBeNull();
  });

  it("createWorkerProfile rejects a duplicate name", async () => {
    await createWorkerProfile(makeInput("dup"));
    await expect(createWorkerProfile(makeInput("dup"))).rejects.toThrow(
      /dup/
    );
  });
});
