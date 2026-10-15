import { describe, expect, it, vi } from "vitest";
import { BaseNode, NodeRegistry } from "@nodetool-ai/node-sdk";
import { createMissingPackError } from "@nodetool-ai/node-catalog";
import { processingMessageSchema } from "@nodetool-ai/protocol";
import { ExecutionSession } from "../src/session.js";
import { buildWorkflowRunPayload } from "../src/service/workflow-run.js";

describe("lazy pack failure transport", () => {
  it("retains an installed node's failure through execution results, job messages and serialized reports", async () => {
    const missing = createMissingPackError("game", ["fixture.InstalledLazy"]);
    const process = vi.fn(async (): Promise<Record<string, unknown>> => { throw missing; });
    class InstalledLazy extends BaseNode {
      static readonly nodeType = "fixture.InstalledLazy";
      static readonly title = "Installed lazy fixture";
      static readonly description = "";
      static readonly metadataOutputTypes = { output: "str" };
      override process = process;
    }
    const registry = new NodeRegistry();
    registry.register(InstalledLazy);
    const session = await ExecutionSession.create({
      graph: { nodes: [{ id: "lazy", type: InstalledLazy.nodeType, properties: {} }], edges: [] },
      registry, bridgeFactory: async () => null, preflight: false
    });
    const result = await session.result;
    expect(result.status).toBe("failed");
    expect(result.missingPack).toEqual(missing.details);
    expect(process).toHaveBeenCalledTimes(1);
    const job = result.messages.find(message => message.type === "job_update" && message.status === "failed");
    expect(processingMessageSchema.parse(JSON.parse(JSON.stringify(job)))).toMatchObject({ type: "job_update", missing_pack: missing.details });
    const node = result.messages.find(message => message.type === "node_update" && message.status === "error");
    expect(processingMessageSchema.parse(JSON.parse(JSON.stringify(node)))).toMatchObject({ type: "node_update", error_detail: { code: "missing_pack", missing_pack: missing.details } });
    for (const debug of [true, false]) {
      expect(JSON.parse(JSON.stringify(buildWorkflowRunPayload("job", "workflow", result, debug, { background: false })))).toMatchObject({ status: "failed", missingPack: missing.details });
    }
  });

  it("preserves generic execution failures without adding pack details", async () => {
    const session = await ExecutionSession.create({
      graph: { nodes: [{ id: "generic", type: "fixture.GenericFailure", properties: {} }], edges: [] },
      resolveExecutor: () => ({ process: async () => { throw new Error("generic failure"); } }),
      bridgeFactory: async () => null, preflight: false
    });
    const result = await session.result;
    expect(result.status).toBe("failed");
    expect(result.error).toContain("generic failure");
    expect(result.missingPack).toBeUndefined();
    expect(buildWorkflowRunPayload("job", "workflow", result, false, { background: false })).not.toHaveProperty("missingPack");
  });
});
