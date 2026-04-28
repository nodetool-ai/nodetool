import { describe, it, expect } from "vitest";
import { ToolClient } from "@nodetool-ai/sandbox";
import {
  createSandboxTools,
  listSandboxToolNames
} from "../src/manifest.js";

function fakeClient(): ToolClient {
  const fakeFetch: typeof fetch = ((
    _input: RequestInfo | URL,
    _init?: RequestInit
  ) =>
    Promise.resolve(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    )) as typeof fetch;
  return new ToolClient({ baseUrl: "http://sbx", fetch: fakeFetch });
}

describe("createSandboxTools", () => {
  it("produces a tool per manifest entry", () => {
    const tools = createSandboxTools(fakeClient());
    expect(tools.length).toBe(listSandboxToolNames().length);
    expect(tools.length).toBeGreaterThanOrEqual(30);
    for (const tool of tools) {
      expect(tool.name.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("names are unique", () => {
    const names = createSandboxTools(fakeClient()).map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("filters by include list", () => {
    const tools = createSandboxTools(fakeClient(), {
      include: ["file_read", "shell_exec"]
    });
    expect(tools.map((t) => t.name).sort()).toEqual([
      "file_read",
      "shell_exec"
    ]);
  });

  it("filters by exclude list", () => {
    const all = createSandboxTools(fakeClient());
    const filtered = createSandboxTools(fakeClient(), {
      exclude: ["browser_view"]
    });
    expect(filtered.length).toBe(all.length - 1);
    expect(filtered.some((t) => t.name === "browser_view")).toBe(false);
  });

  it("covers the major tool groups", () => {
    const names = listSandboxToolNames();
    expect(names).toContain("file_read");
    expect(names).toContain("shell_exec");
    expect(names).toContain("browser_navigate");
    expect(names).toContain("screen_capture");
    expect(names).toContain("info_search_web");
    expect(names).toContain("message_notify_user");
    expect(names).toContain("idle");
    expect(names).toContain("expose_port");
  });

  it("includes exactly one idle tool and one info_search_web tool", () => {
    const names = listSandboxToolNames();
    expect(names.filter((n) => n === "idle")).toHaveLength(1);
    expect(names.filter((n) => n === "info_search_web")).toHaveLength(1);
  });
});
