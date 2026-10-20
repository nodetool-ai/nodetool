import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createTestUiRunRoutes } from "../src/lib/test-ui-run-routes.js";

describe("test UI run routes", () => {
  afterEach(() => {
    delete process.env["NODETOOL_STUDY_APP_MODEL"];
  });

  it("serves the app design, build and install routes", async () => {
    const routes = createTestUiRunRoutes();
    expect(routes.matches("/api/applications/spec")).toBe(true);
    expect(routes.matches("/api/applications/build")).toBe(true);
    expect(routes.matches("/api/applications/import-bundle")).toBe(true);
    expect(routes.matches("/api/applications/debug")).toBe(false);
    await routes.close();
  });

  // Every request runs as user "1", so another site must not reach them.
  it("refuses a rebound Host and a cross-site browser request", async () => {
    const routes = createTestUiRunRoutes();
    const server: Server = createServer((req, res) => {
      void routes.handle(req, res);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    const status = (headers: Record<string, string>): Promise<number> =>
      new Promise((resolve, reject) => {
        const req = request(
          { host: "127.0.0.1", port, path: "/api/app-instances", method: "GET", headers },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          }
        );
        req.on("error", reject);
        req.end();
      });
    try {
      expect(await status({ host: "evil.example:1234" })).toBe(403);
      expect(await status({ origin: "https://evil.example" })).toBe(403);
      expect(await status({ "sec-fetch-site": "cross-site" })).toBe(403);
      expect(await status({})).not.toBe(403);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await routes.close();
    }
  });

  it("refuses a study model on a provider other than the Claude Agent provider", () => {
    process.env["NODETOOL_STUDY_APP_MODEL"] = "openai/gpt-5";
    expect(() => createTestUiRunRoutes()).toThrow(/claude_agent_sdk/);
  });
});
