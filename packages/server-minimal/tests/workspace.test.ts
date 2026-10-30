import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createSqliteRepository } from "@nodetool-ai/database-sqlite";
import { createMinimalServer, type MinimalFeatureHost } from "../src/index.js";

it("composes persistent per-tenant per-run workspaces and owns an injected repository", async () => {
  const directory = await mkdtemp(join(tmpdir(), "minimal-workspace-"));
  let execution: MinimalFeatureHost["execution"] | undefined;
  let closed = false;
  const repository = createSqliteRepository(join(directory, "selected.db"));
  const options = {
    directory,
    masterKey: "fixture-key".repeat(8),
    tokens: { ["a".repeat(32)]: "../alice" },
    features: [{ id: "workspace-test", load: async () => ({
      descriptor: { id: "workspace-test", apiVersion: 1 },
      activate(host: MinimalFeatureHost) {
        execution = host.execution;
        host.execution.register({
          type: { nodeType: "test.Workspace", supportsDynamicInputs: true, outputs: { output: "str" }, descriptorDefaults: { input_mode: "buffered" } },
          create: (_node, request) => ({ async process(inputs) {
            if (!request.workspace) {
              throw new Error("Missing run workspace");
            }
            expect(request.workspace.localDir).toMatch(/workspaces[/\\][a-f0-9]{64}[/\\][a-f0-9]{64}$/);
            expect(() => request.workspace?.key("../escape")).toThrow();
            if (typeof inputs.value === "string") {
              await request.workspace.write("saved.txt", inputs.value);
            }
            return { output: await request.workspace.readText("saved.txt") };
          } })
        });
      }
    }) }]
  };
  let app = await createMinimalServer({ ...options, repository: { ...repository, async close() { await Promise.resolve(); repository.close(); closed = true; } } });
  async function run(userId: string, jobId: string, value?: string): Promise<string> {
    if (!execution) {
      throw new Error("Feature was not activated");
    }
    const events: unknown[] = [];
    await execution.run({ graph: { nodes: [{ id: "workspace", type: "test.Workspace", properties: value === undefined ? {} : { value } }], edges: [] }, userId, jobId, signal: new AbortController().signal, emit: event => events.push(event) });
    return JSON.stringify(events);
  }
  try {
    expect(await run("../alice", "../../run", "persisted")).toContain("persisted");
    expect(await run("bob", "../../run")).not.toContain("persisted");
    expect(await run("../alice", "other-run")).not.toContain("persisted");
    await app.close();
    expect(closed).toBe(true);
    app = await createMinimalServer(options);
    expect(await run("../alice", "../../run")).toContain("persisted");
    expect((await app.inject({ method: "GET", url: "/api/workflows", headers: { authorization: `Bearer ${"a".repeat(32)}` } })).statusCode).toBe(200);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
