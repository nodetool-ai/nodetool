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

  it("refuses a study model on a provider other than the Claude Agent provider", () => {
    process.env["NODETOOL_STUDY_APP_MODEL"] = "openai/gpt-5";
    expect(() => createTestUiRunRoutes()).toThrow(/claude_agent_sdk/);
  });
});
