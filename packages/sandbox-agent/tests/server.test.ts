import { describe, it, expect } from "vitest";
import { buildServer, SANDBOX_AGENT_VERSION } from "../src/server.js";
import { _resetForTests as resetSecretMap } from "../src/secret-map.js";

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

  it("rejects browser_click without index or full coords", async () => {
    const app = buildServer();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/browser/click",
        payload: { coordinate_x: 10 }
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it("rejects mouse_drag missing required coords", async () => {
    const app = buildServer();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/desktop/mouse/drag",
        payload: { from_x: 0, from_y: 0 }
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it("supports internal secret map updates and secret reads", async () => {
    resetSecretMap();
    const app = buildServer();
    try {
      const setRes = await app.inject({
        method: "POST",
        url: "/internal/set-secret-map",
        payload: { map: { OPENAI_API_KEY: "sk-test" } }
      });
      expect(setRes.statusCode).toBe(200);

      const getRes = await app.inject({
        method: "POST",
        url: "/secrets/get",
        payload: { name: "OPENAI_API_KEY" }
      });
      expect(getRes.statusCode).toBe(200);
      expect(getRes.json()).toEqual({
        name: "OPENAI_API_KEY",
        value: "sk-test"
      });
    } finally {
      await app.close();
      resetSecretMap();
    }
  });

  it("rejects non-loopback callers for internal control routes", async () => {
    const app = buildServer();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/internal/set-secret-map",
        remoteAddress: "10.1.2.3",
        payload: { map: { OPENAI_API_KEY: "sk-test" } }
      });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it("rejects invalid secret map entries", async () => {
    const app = buildServer();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/internal/set-secret-map",
        payload: { map: { OPENAI_API_KEY: "" } }
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
