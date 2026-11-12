/**
 * `callNode` in a chat or MCP code action failed on the hosted server with
 * `"@nodetool-ai/dsl/flow" does not resolve here`. The flow capability loads
 * that module by name at run time, and the bundled server stages no
 * `@nodetool-ai/dsl` beside `server.mjs`, so the load fails there. The mock
 * below makes the by-name load fail the same way.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProcessingContext } from "@nodetool-ai/runtime";

vi.mock("@nodetool-ai/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nodetool-ai/config")>();
  return {
    ...actual,
    importHidden: async (name: string) => {
      if (name === "@nodetool-ai/dsl/flow") {
        throw new Error(`Cannot find package '${name}'`);
      }
      return actual.importHidden(name);
    }
  };
});

const { UNGATED, createCapabilityRun } = await import(
  "../src/capabilities/index.js"
);
const { FLOW_CAPABILITIES, setFlowBackend } = await import(
  "../src/capabilities/flow.js"
);
const { registerFlowBackend } = await import("../src/index.js");

function run() {
  return createCapabilityRun({
    context: new ProcessingContext({
      jobId: "job-flow-registration",
      workflowId: null,
      userId: "1"
    }),
    gate: UNGATED,
    capabilities: FLOW_CAPABILITIES
  });
}

afterEach(() => setFlowBackend(null));

describe("flow backend in a host that cannot load it by name", () => {
  it("refuses node calls when nothing registered the backend", async () => {
    await expect(
      run().invoke("invoke_node", {
        type: "nodetool.text.Concat",
        inputs: { a: "a", b: "b" }
      })
    ).rejects.toThrow(/does not resolve here/);
  });

  it("runs a node once the host registers the backend it imported", async () => {
    // A host above `dsl` in the package graph imports the module statically.
    const backend = await import("../../dsl/src/flow/index.js");
    registerFlowBackend(backend);

    const outputs = await run().invoke("invoke_node", {
      type: "nodetool.text.Concat",
      inputs: { a: "hi ", b: "there" }
    });

    expect(outputs).toEqual({ output: "hi there" });
  }, 180_000);
});
