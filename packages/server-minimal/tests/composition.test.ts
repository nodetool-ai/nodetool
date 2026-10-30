import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMinimalServer, ConfiguredTokenAuth } from "../src/index.js";

const token = "fixture-token-000000000000000000000000000";
const masterKey = "fixture-key-00000000000000000000000000000";

describe("minimal server composition", () => {
  it("requires explicit token assignments", async () => {
    expect(() => new ConfiguredTokenAuth({})).toThrow();
    expect(() => new ConfiguredTokenAuth({ short: "alice" })).toThrow();
    const auth = new ConfiguredTokenAuth({ [token]: "alice" });
    expect(await auth.verifyToken(token)).toMatchObject({ ok: true, userId: "alice" });
    expect(await auth.verifyToken("other")).toMatchObject({ ok: false });
  });

  it("persists authenticated workflows through a server restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "minimal-server-"));
    try {
      const options = { directory, masterKey, tokens: { [token]: "alice" } };
      const app = await createMinimalServer(options);
      expect((await app.inject({ method: "GET", url: "/api/workflows" })).statusCode).toBe(401);
      const headers = { authorization: `Bearer ${token}` };
      const created = await app.inject({ method: "POST", url: "/api/workflows", headers, payload: { name: "persisted", graph: { nodes: [], edges: [] } } });
      expect(created.statusCode).toBe(200);
      await app.close();
      const restarted = await createMinimalServer(options);
      try {
        const listed = await restarted.inject({ method: "GET", url: "/api/workflows", headers });
        expect(listed.statusCode).toBe(200);
        expect(listed.body).toContain("persisted");
      } finally {
        await restarted.close();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
