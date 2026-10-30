import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";
import { feature } from "../src/index.js";

describe("stdio MCP authoring discovery", () => {
  it("loads guides, pack docs, game tools and shipped examples from an empty workspace", async () => {
    expect(feature.descriptor.requires).toEqual(["core", "text"]);
    const directory = mkdtempSync(join(tmpdir(), "nodetool-mcp-discovery-"));
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", import.meta.resolve("tsx"), resolve(import.meta.dirname, "../src/nodetool.ts"), "mcp", "serve"],
      cwd: directory,
      env: {
        PATH: process.env.PATH ?? "",
        XDG_DATA_HOME: directory,
        PORT: "1",
        NODETOOL_LOG_LEVEL: "error",
        SECRETS_MASTER_KEY: "a".repeat(64)
      },
      stderr: "pipe"
    });
    let diagnostics = "";
    transport.stderr?.on("data", (chunk: Buffer) => { diagnostics += chunk.toString(); });
    const client = new Client({ name: "discovery-test", version: "1" });
    try {
      await client.connect(transport);
      const response = await client.callTool({
        name: "execute_code",
        arguments: { code: `
          import { list_skills, load_skill } from "@nodetool-ai/sandbox-nodetool/skills";
          const skills = await list_skills({ query: "app" });
          const guide = await load_skill({ name: "api-apps" });
          const docs = await nodetool.packs.docs("@nodetool-ai/sandbox-timeline");
          const games = await nodetool.searchTools("game");
          const timelines = await nodetool.timelines.examples.list();
          const workflows = await nodetool.workflows.list({ workflow_type: "example", query: "text" });
          return { skills: skills.count, guide: guide.success, docs: docs.length, games: games.length, timelines: timelines.count, workflows: workflows.workflows.length };
        ` }
      });
      const text = Array.isArray(response.content)
        ? response.content.find((part) => part.type === "text")?.text
        : undefined;
      expect(typeof text, diagnostics).toBe("string");
      const observation = JSON.parse(String(text));
      expect(observation.ok, observation.error ?? diagnostics).toBe(true);
      expect(observation.result.guide).toBe(true);
      const execution = await client.callTool({ name: "execute_code", arguments: { code: `
        import { create_workflow, run_workflow } from "@nodetool-ai/sandbox-nodetool/workflows";
        const created = await create_workflow({ name: "MCP baseline prerequisites", graph: {
          nodes: [
            { id: "input", type: "nodetool.input.StringInput", properties: { name: "text", value: "MCP baseline text" } },
            { id: "text", type: "nodetool.text.Concat" },
            { id: "out", type: "nodetool.control.Reroute" }
          ],
          edges: [
            { source: "input", target: "text", sourceHandle: "output", targetHandle: "value" },
            { source: "text", target: "out", sourceHandle: "output", targetHandle: "input_value" }
          ]
        } });
        return await run_workflow({ workflow_id: created.id, params: { text: "MCP baseline text" } });
      ` } });
      const executionText = Array.isArray(execution.content) ? execution.content.find(part => part.type === "text")?.text : undefined;
      const executed = JSON.parse(String(executionText));
      expect(executed.ok, String(executionText)).toBe(true);
      expect(executed.result.status, String(executionText)).toBe("completed");
      expect(JSON.stringify(executed.result.outputs)).toContain("MCP baseline text");
      for (const key of ["skills", "docs", "games", "timelines", "workflows"]) {
        expect(observation.result[key], key).toBeGreaterThan(0);
      }
      const resource = await client.readResource({ uri: "nodetool://capabilities" });
      const catalog = JSON.parse(String(resource.contents[0]?.text));
      expect(catalog.modules).toEqual(expect.arrayContaining([
        expect.objectContaining({ namespace: "games", exports: expect.arrayContaining(["create_native_game"]) })
      ]));
    } finally {
      await client.close();
      rmSync(directory, { recursive: true, force: true });
    }
  }, 60_000);
});
