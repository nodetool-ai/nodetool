import { expect, it } from "vitest";
import { BaseNode, NodeRegistry } from "@nodetool-ai/node-sdk";
import { createMissingPackError } from "@nodetool-ai/node-catalog";
import { missingPackDetailsOf } from "@nodetool-ai/protocol";
import { commandFailureExitCode } from "../../cli/src/command-errors.js";
import { run, type Workflow } from "../src/core.js";

class LazyPackNode extends BaseNode {
  static readonly nodeType = "fixture.DslLazyPack";
  static readonly title = "Lazy pack";
  static readonly description = "";
  async process(): Promise<Record<string, unknown>> {
    throw createMissingPackError("game", [LazyPackNode.nodeType]);
  }
}

it("preserves an executable node's lazy missing-pack refusal and CLI exit code", async () => {
  const registry = new NodeRegistry();
  registry.register(LazyPackNode);
  const workflow: Workflow = {
    nodes: [{ id: "lazy", type: LazyPackNode.nodeType, data: {}, streaming: false, streamingInput: false }],
    edges: []
  };
  const error = await run(workflow, { registry }).then(
    () => { throw new Error("Lazy pack fixture unexpectedly succeeded"); },
    (failure: unknown) => failure
  );
  expect(missingPackDetailsOf(error)).toMatchObject({
    error: "missing_pack", nodeTypes: [LazyPackNode.nodeType],
    packs: expect.arrayContaining([expect.objectContaining({ id: "game" })])
  });
  expect(commandFailureExitCode(error)).toBe(3);
}, 30_000);
