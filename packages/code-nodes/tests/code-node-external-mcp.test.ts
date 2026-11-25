/**
 * External MCP tools in a Code node: importable from
 * `@nodetool-ai/sandbox-nodetool/mcp`, and gated like any call the code picks.
 * A background run (headless gate) may call a tool its server marks read-only
 * and is denied the rest, before the server sees a call.
 */
import { describe, it, expect } from "vitest";
import { CodeNode } from "@nodetool-ai/code-nodes";
import {
  EXTERNAL_MCP_CONTEXT_KEY,
  PERMISSION_GATE_CONTEXT_KEY,
  ProcessingContext,
  headlessGate,
  type ExternalMcpAccess
} from "@nodetool-ai/runtime";

function access(): { access: ExternalMcpAccess; log: string[] } {
  const log: string[] = [];
  return {
    log,
    access: {
      servers: async () => {
        log.push("servers");
        return [{ id: "home", name: "Home" }];
      },
      tools: async () => [
        { name: "get_state", inputSchema: { type: "object" }, readOnly: true },
        { name: "set_light", inputSchema: { type: "object" }, readOnly: false }
      ],
      call: async (_server, tool, args) => {
        log.push(`${tool}:${JSON.stringify(args)}`);
        return { text: `${tool} ok`, isError: false, images: [], links: [] };
      }
    }
  };
}

function context(access: ExternalMcpAccess | null): ProcessingContext {
  const c = new ProcessingContext({ jobId: "j", userId: "u1" });
  if (access) c.set(EXTERNAL_MCP_CONTEXT_KEY, access);
  c.set(PERMISSION_GATE_CONTEXT_KEY, headlessGate("workflow run"));
  return c;
}

const run = (code: string, c: ProcessingContext) => new CodeNode({ code }).process(c);

describe("CodeNode — external MCP tools", () => {
  it("lets a background run import and call a read-only tool", async () => {
    const fake = access();
    const out = await run(
      `import { mcp_home_get_state } from "@nodetool-ai/sandbox-nodetool/mcp";
       const r = await mcp_home_get_state({ name: "lamp" });
       await output("text", r.text);`,
      context(fake.access)
    );
    expect(out["text"]).toBe("get_state ok");
    expect(fake.log).toContain('get_state:{"name":"lamp"}');
  }, 60_000);

  it("denies any other tool to a background run and never calls the server", async () => {
    const fake = access();
    const out = await run(
      `import { mcp_home_set_light } from "@nodetool-ai/sandbox-nodetool/mcp";
       try {
         await mcp_home_set_light({ name: "lamp" });
         await output("result", "ran");
       } catch (e) {
         await output("result", String(e.message));
       }`,
      context(fake.access)
    );
    expect(String(out["result"])).toContain("declined");
    expect(fake.log.filter((l) => l.startsWith("set_light"))).toEqual([]);
  }, 60_000);

  it("opens no connection for a body that never mentions an MCP tool", async () => {
    const fake = access();
    const out = await run(`await output("n", 1 + 1);`, context(fake.access));
    expect(out["n"]).toBe(2);
    expect(fake.log).toEqual([]);
  }, 60_000);

  it("refuses the import when the host offers no external servers", async () => {
    await expect(
      run(
        `import { mcp_home_get_state } from "@nodetool-ai/sandbox-nodetool/mcp";
         await output("x", 1);`,
        context(null)
      )
    ).rejects.toThrow(/not a NodeTool capability module/);
  }, 60_000);
});
