import { describe, it, expect } from "vitest";
import { buildServer, SANDBOX_AGENT_VERSION } from "../src/server.js";

describe("buildServer / health", () => {
  it("responds on /health with ok", async () => {
    const app = buildServer({ workspace: "/workspace" });
    try {
      const res = await app.inject({ method: "GET", url: "/health" });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);
      expect(body.version).toBe(SANDBOX_AGENT_VERSION);
      expect(body.workspace).toBe("/workspace");
    } finally {
      await app.close();
    }
  });

  it("returns 400 with issues when a route receives invalid input", async () => {
    const app = buildServer();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/file/read",
        payload: { file: "" }
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBe("invalid input");
      expect(Array.isArray(body.issues)).toBe(true);
    } finally {
      await app.close();
    }
  });
});
