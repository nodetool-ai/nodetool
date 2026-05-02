import { describe, it, expect, beforeEach } from "vitest";

import { initTestDb } from "../src/db.js";
import { DeploymentAudit } from "../src/deployment-audit.js";

describe("DeploymentAudit model", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("appends entries with auto id + ts", async () => {
    const e = await DeploymentAudit.append({
      user_id: "u1",
      action: "deployment.create",
      status: "ok"
    });
    expect(e.id).toBeTruthy();
    expect(e.ts).toMatch(/^\d{4}-/);
    expect(e.actor).toBe("u1"); // defaults to user_id
  });

  it("records meta as JSON and reads it back", async () => {
    await DeploymentAudit.append({
      user_id: "u1",
      action: "deployment.apply",
      deployment_name: "prod",
      status: "ok",
      meta: { workers: 3 }
    });
    const [row] = await DeploymentAudit.listForUser("u1");
    expect(JSON.parse(row.meta_json!)).toEqual({ workers: 3 });
  });

  it("records errors", async () => {
    await DeploymentAudit.append({
      user_id: "u1",
      action: "deployment.apply",
      deployment_name: "prod",
      status: "error",
      error: "boom"
    });
    const [row] = await DeploymentAudit.listForUser("u1");
    expect(row.status).toBe("error");
    expect(row.error).toBe("boom");
  });

  it("isolates entries between users", async () => {
    await DeploymentAudit.append({ user_id: "alice", action: "x", status: "ok" });
    await DeploymentAudit.append({ user_id: "bob", action: "y", status: "ok" });
    expect(await DeploymentAudit.listForUser("alice")).toHaveLength(1);
    expect(await DeploymentAudit.listForUser("bob")).toHaveLength(1);
  });

  it("listForDeployment filters to a single deployment", async () => {
    await DeploymentAudit.append({
      user_id: "u1",
      action: "deployment.apply",
      deployment_name: "prod",
      status: "ok"
    });
    await DeploymentAudit.append({
      user_id: "u1",
      action: "deployment.apply",
      deployment_name: "staging",
      status: "ok"
    });
    const prod = await DeploymentAudit.listForDeployment("u1", "prod");
    expect(prod).toHaveLength(1);
    expect(prod[0].deployment_name).toBe("prod");
  });

  it("removeAllForUser clears that user's history only", async () => {
    await DeploymentAudit.append({ user_id: "u1", action: "x", status: "ok" });
    await DeploymentAudit.append({ user_id: "u2", action: "x", status: "ok" });
    await DeploymentAudit.removeAllForUser("u1");
    expect(await DeploymentAudit.listForUser("u1")).toEqual([]);
    expect(await DeploymentAudit.listForUser("u2")).toHaveLength(1);
  });
});
