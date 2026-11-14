import { describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPackMcpTools, type PackCliRunner } from "../src/mcp-pack-tools.js";

type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }>; isError: boolean }>;

function setup(code = 0) {
  const handlers = new Map<string, Handler>();
  const server = { tool: (name: string, _d: string, _s: unknown, h: Handler) => { handlers.set(name, h); } } as unknown as McpServer;
  const run = vi.fn<PackCliRunner>(async () => ({ code, stdout: "out", stderr: "" }));
  registerPackMcpTools(server, run);
  return { handlers, run };
}

describe("pack MCP tools", () => {
  it("lists packs as JSON", async () => {
    const { handlers, run } = setup();
    const res = await handlers.get("inspect_packs")!({ action: "list" });
    expect(run).toHaveBeenCalledWith(["list", "--json"]);
    expect(res.isError).toBe(false);
  });

  it("installs with --yes and returns the restart notice", async () => {
    const { handlers, run } = setup();
    const res = await handlers.get("manage_packs")!({ action: "add", ids: ["fal", "@nodetool-ai/x"] });
    expect(run).toHaveBeenCalledWith(["add", "fal", "@nodetool-ai/x", "--yes"]);
    expect(res.content[0].text).toContain("Restart");
  });

  it("removes and repairs through the CLI", async () => {
    const { handlers, run } = setup();
    await handlers.get("manage_packs")!({ action: "remove", ids: ["fal"] });
    await handlers.get("manage_packs")!({ action: "repair" });
    expect(run.mock.calls).toEqual([[["remove", "fal"]], [["doctor", "--repair", "--json"]]]);
  });

  it("rejects ids that look like flags", async () => {
    const { handlers, run } = setup();
    const res = await handlers.get("manage_packs")!({ action: "add", ids: ["--registry=evil"] });
    expect(res.isError).toBe(true);
    expect(run).not.toHaveBeenCalled();
  });

  it("requires ids for add", async () => {
    const { handlers } = setup();
    expect((await handlers.get("manage_packs")!({ action: "add" })).isError).toBe(true);
  });

  it("reports a failed CLI run as an error without the notice", async () => {
    const { handlers } = setup(1);
    const res = await handlers.get("manage_packs")!({ action: "add", ids: ["fal"] });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).not.toContain("Restart");
  });
});
