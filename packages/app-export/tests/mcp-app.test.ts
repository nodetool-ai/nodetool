import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MCP_APP_RENDERER_HTML } from "../src/mcp-app.js";
// @ts-expect-error -- plain ESM script without type declarations
import { renderMcpAppModule } from "../scripts/build-mcp-app.mjs";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("MCP app renderer", () => {
  it("is embedded in its current form", async () => {
    const generated = readFileSync(join(packageRoot, "src", "mcp-app-renderer.generated.ts"), "utf8");
    expect(generated).toBe(await renderMcpAppModule());
  });

  it("is one page that loads nothing at runtime", () => {
    expect(MCP_APP_RENDERER_HTML.startsWith("<!doctype html>")).toBe(true);
    expect(MCP_APP_RENDERER_HTML).not.toMatch(/<script[^>]+src=/);
    expect(MCP_APP_RENDERER_HTML).not.toMatch(/<link[^>]+href=/);
    expect(MCP_APP_RENDERER_HTML.match(/<\/script/gi)).toHaveLength(1);
  });

  it("runs through MCP tools, not the exported app's own server", () => {
    expect(MCP_APP_RENDERER_HTML).toContain("ui/initialize");
    expect(MCP_APP_RENDERER_HTML).toContain("run_app_operation");
    expect(MCP_APP_RENDERER_HTML).toContain("poll_app_run");
    expect(MCP_APP_RENDERER_HTML).not.toContain("/api/run");
    expect(MCP_APP_RENDERER_HTML).not.toContain("/api/upload");
  });
});
