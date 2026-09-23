import { describe, expect, it } from "vitest";
import { getNodeMetadata } from "@nodetool-ai/node-sdk";
import { AGENT_NODES, DecisionNode } from "../src/nodes/agents.js";

type Sent = { messages: Array<{ role: string; content: unknown }> };

/** A provider that answers the decision tool with `args` and records requests. */
function mockContext(args: Record<string, unknown>) {
  const sent: Sent[] = [];
  const provider = {
    generateMessage: async (request: Sent) => {
      sent.push(request);
      return {
        content: "",
        toolCalls: [{ id: "t1", name: "decision_result", args }]
      };
    },
    async generateMessageTraced(...a: any[]) {
      return (this as any).generateMessage(...a);
    }
  };
  return { sent, context: { getProvider: async () => provider } as any };
}

function decision(props: Record<string, unknown>) {
  const node = new (DecisionNode as any)();
  node.assign({ model: { provider: "test", id: "m1" }, ...props });
  return node;
}

describe("DecisionNode", () => {
  it("is registered with the agent nodes and declares its branches", () => {
    expect(DecisionNode.nodeType).toBe("nodetool.agents.Decision");
    expect(AGENT_NODES).toContain(DecisionNode);
    const meta = getNodeMetadata(DecisionNode as any);
    expect(meta.outputs.map((o) => o.name)).toEqual([
      "decision",
      "reason",
      "if_true",
      "if_false"
    ]);
  });

  it("routes the value down if_true and reports the reason", async () => {
    const { context } = mockContext({ decision: true, reason: "Covers the brief." });
    const result = await decision({
      prompt: "Is the draft ready?",
      value: "draft text"
    }).process(context);
    expect(result).toEqual({
      decision: true,
      reason: "Covers the brief.",
      if_true: "draft text"
    });
  });

  it("emits only if_false when the answer is no", async () => {
    const { context } = mockContext({ decision: "no", reason: "Too short." });
    const result = await decision({ prompt: "Ready?", value: 7 }).process(context);
    expect(result).toEqual({ decision: false, reason: "Too short.", if_false: 7 });
    expect("if_true" in result).toBe(false);
  });

  it("shows the question, the value, and named dynamic inputs to the model", async () => {
    const { context, sent } = mockContext({ decision: true, reason: "ok" });
    const node = decision({ prompt: "Does it match the brief?", value: "the draft" });
    node.setDynamic("brief", { topic: "loops" });
    await node.process(context);
    const user = sent[0].messages.find((m) => m.role === "user");
    expect(user?.content).toContain("Question: Does it match the brief?");
    expect(user?.content).toContain('<input name="value">\nthe draft\n</input>');
    expect(user?.content).toContain('<input name="brief">');
    expect(user?.content).toContain('"topic": "loops"');
  });

  it("attaches an image value to the message", async () => {
    const { context, sent } = mockContext({ decision: false, reason: "blurry" });
    const image = { type: "image", uri: "https://example.com/a.png" };
    await decision({ prompt: "Is the image sharp?", value: image }).process(context);
    const user = sent[0].messages.find((m) => m.role === "user");
    const parts = user?.content as Array<{ type: string }>;
    expect(parts.some((p) => p.type === "image_url")).toBe(true);
  });

  it("fails when the model does not return a yes/no decision", async () => {
    const { context } = mockContext({ decision: "maybe", reason: "?" });
    await expect(
      decision({ prompt: "Ready?", value: 1 }).process(context)
    ).rejects.toThrow(/did not return a yes\/no decision/);
  });

  it("requires a prompt and a model", async () => {
    await expect(decision({ prompt: "  " }).process({} as any)).rejects.toThrow(
      /needs a prompt/
    );
    const node = new (DecisionNode as any)();
    node.assign({ prompt: "Ready?" });
    await expect(node.process()).rejects.toThrow("Select a model");
  });
});
