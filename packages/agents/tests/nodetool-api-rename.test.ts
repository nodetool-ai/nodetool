/**
 * `rename(id, name)` and `workflows.update` on the `nodetool` object model —
 * code actions run in the real QuickJS sandbox against a fake tool router, and
 * each lands on the edit tool that owns the document. No network.
 */
import { describe, it, expect } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  createChatCodeActSession,
  type ChatCodeActToolCall
} from "../src/codeact/chat-codeact.js";
import { createMockContext } from "./_helpers/mock-context.js";

const TOOLS = [
  "update_workflow",
  "edit_timeline",
  "edit_sketch",
  "edit_script",
  "edit_storyboard"
].map((name) => ({
  name,
  description: `Tool ${name}.`,
  inputSchema: { type: "object", properties: {} }
}));

function session() {
  const calls: ChatCodeActToolCall[] = [];
  const codeact = createChatCodeActSession({
    tools: TOOLS,
    executeTool: async (call) => {
      calls.push(call);
      return JSON.stringify({ ok: true });
    },
    context: createMockContext() as unknown as ProcessingContext
  });
  return { codeact, calls };
}

describe("nodetool.*.rename", () => {
  it("renames each document type through its edit tool", async () => {
    const { codeact, calls } = session();
    const observation = JSON.parse(
      await codeact.executeAction({
        code: `await nodetool.workflows.rename("wf1", "Digest");
               await nodetool.timelines.rename("tl1", "Trailer");
               await nodetool.sketches.rename("sk1", "Poster");
               await nodetool.scripts.rename("sc1", "Voiceover");
               await nodetool.storyboards.rename("sb1", "Act one");
               return "done";`
      })
    ) as { ok: boolean; error?: string };

    expect(observation.error).toBeUndefined();
    expect(observation.ok).toBe(true);
    expect(calls.map((call) => [call.name, call.args])).toEqual([
      ["update_workflow", { workflow_id: "wf1", name: "Digest" }],
      ["edit_timeline", { timeline_id: "tl1", name: "Trailer" }],
      ["edit_sketch", { image_document_id: "sk1", name: "Poster" }],
      ["edit_script", { script_id: "sc1", name: "Voiceover" }],
      ["edit_storyboard", { storyboard_id: "sb1", name: "Act one" }]
    ]);
  });

  it("updates a workflow's fields, serializing a graph object", async () => {
    const { codeact, calls } = session();
    const observation = JSON.parse(
      await codeact.executeAction({
        code: `return await nodetool.workflows.update("wf1", {
                 name: "Digest",
                 tags: ["daily"],
                 graph: { nodes: [], edges: [] }
               });`
      })
    ) as { ok: boolean; error?: string };

    expect(observation.error).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe("update_workflow");
    expect(calls[0]?.args).toMatchObject({
      workflow_id: "wf1",
      name: "Digest",
      tags: ["daily"]
    });
    expect(calls[0]?.args["graph"]).toBeDefined();
  });
});
