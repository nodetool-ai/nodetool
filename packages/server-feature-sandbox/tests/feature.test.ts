import { describe, expect, it } from "vitest";
import { createCoreExecutionHost } from "@nodetool-ai/nodes-core";
import { configureFeatures } from "@nodetool-ai/server-features";
import feature from "../src/index.js";

function graph(code: string) {
  return {
    nodes: [
      {
        id: "code",
        type: "nodetool.code.Code",
        data: { code },
        properties: { code }
      }
    ],
    edges: []
  };
}

describe("installed sandbox feature", () => {
  it("registers a real QuickJS executor and isolates host globals", async () => {
    const execution = createCoreExecutionHost();
    expect(
      execution.validate(graph('await output("value", 42);')).length
    ).toBeGreaterThan(0);
    const installed = await configureFeatures(
      [{ id: "code", load: async () => feature }],
      {
        execution,
        readSecret: async () => undefined,
        readAsset: async () => {
          throw new Error("No assets");
        }
      },
      [{ id: "code", apiVersion: 1, requires: ["llm"], nodeTypes: ["nodetool.code.Code"] }]
    );
    installed.requireNode("nodetool.code.Code");
    const events: unknown[] = [];
    await execution.run({
      graph: graph(
        'await output("value", typeof process + ":" + typeof require);'
      ),
      userId: "alice",
      jobId: "sandbox-test",
      signal: new AbortController().signal,
      emit: (event) => events.push(event)
    });
    expect(JSON.stringify(events)).toContain("undefined:undefined");
  });
});

it("preserves buffered state and configured limits and forwards tenant-scoped bridges", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createLocalWorkspace } = await import("@nodetool-ai/runtime-core");
  const { createSandboxFeature } = await import("../src/index.js");
  const directory = await mkdtemp(join(tmpdir(), "code-feature-"));
  const execution = createCoreExecutionHost();
  let definition:
    | import("@nodetool-ai/nodes-core").CoreNodeDefinition
    | undefined;
  const register = execution.register;
  execution.register = (node) => {
    definition = node;
    register(node);
  };
  const events: unknown[] = [];
  const secrets: string[] = [];
  try {
    await createSandboxFeature({
      limits: { memoryLimitBytes: 1024 * 1024, maxOutputSize: 1024, secretScope: ["allowed"] }
    }).activate({
      execution,
      readSecret: async (owner, name) => {
        secrets.push(`${owner}:${name}`);
        return "scoped-value";
      },
      readAsset: async () => new TextEncoder().encode("asset-text")
    });
    if (!definition) {
      throw new Error("Code was not registered");
    }
    const executor = definition.create(
      { id: "code", type: "nodetool.code.Code" },
      {
        graph: {},
        userId: "alice",
        jobId: "state",
        signal: new AbortController().signal,
        emit: (event) => events.push(event),
        workspace: createLocalWorkspace(directory)
      }
    );
    const inputs = {
      code: 'state.count=(state.count||0)+1; console.log("count", state.count); progress(50,"working"); await workspace.write("data", await getSecret("allowed")); await output("count", state.count); await output("data", await workspace.read("data")); await output("asset", await media.text({type:"document",uri:"asset://fixture",asset_id:null}));',
      timeout: 2,
      secrets: ["allowed"]
    };
    expect(await executor.process(inputs)).toMatchObject({
      count: 1,
      data: "scoped-value",
      asset: "asset-text"
    });
    expect(await executor.process(inputs)).toMatchObject({ count: 2 });
    expect(secrets).toEqual(["alice:allowed", "alice:allowed"]);
    expect(JSON.stringify(events)).toContain("log_update");
    expect(JSON.stringify(events)).toContain("node_progress");
    await expect(
      executor.process({
        code: 'return await getSecret("denied");',
        secrets: ["allowed"]
      })
    ).rejects.toThrow("scope");
    await expect(
      executor.process({ code: "while(true){}", timeout: 0.02 })
    ).rejects.toThrow();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
