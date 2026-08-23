import { describe, expect, it } from "vitest";

import { ConcatTextNode, ReplaceTextNode } from "@nodetool-ai/text-nodes";

// CountTokensNode is gone — tiktoken reaches the sandbox as the
// @nodetool-ai/sandbox-tokens host pack, covered by
// packages/agents/tests/host-modules.test.ts.

describe("AutomaticSpeechRecognitionNode platforms", () => {
  it("is available in the production cloud (node + workers + edge)", async () => {
    const { AutomaticSpeechRecognitionNode } = await import(
      "@nodetool-ai/text-nodes"
    );
    const platforms = AutomaticSpeechRecognitionNode.platforms ?? [];
    expect(platforms).toContain("node");
    expect(platforms).toContain("workers");
    expect(platforms).toContain("edge");
  });

  it("keeps filesystem-bound text nodes node-only", async () => {
    const { SaveTextFileNode, SaveTextNode, LoadTextFolderNode } = await import(
      "@nodetool-ai/text-nodes"
    );
    for (const cls of [SaveTextFileNode, SaveTextNode, LoadTextFolderNode]) {
      expect(cls.platforms).toEqual(["node"]);
    }
  });
});

describe("ConcatTextNode — flattens list inputs", () => {
  it("concatenates separate dynamic inputs (back-compat)", async () => {
    const node = new ConcatTextNode();
    node.setDynamic("a", "foo");
    node.setDynamic("b", "bar");
    expect((await node.process()).output).toBe("foobar");
  });

  it("flattens a list wired into a single input", async () => {
    const node = new ConcatTextNode();
    node.setDynamic("parts", ["a", "b", "c"]);
    // Without flattening this would stringify the array as "a,b,c".
    expect((await node.process()).output).toBe("abc");
  });

  it("mixes single inputs and list inputs in order", async () => {
    const node = new ConcatTextNode();
    node.setDynamic("intro", "<");
    node.setDynamic("body", ["x", "y"]);
    node.setDynamic("outro", ">");
    expect((await node.process()).output).toBe("<xy>");
  });
});

describe("ReplaceTextNode", () => {
  it("replaces every occurrence", async () => {
    const node = new ReplaceTextNode();
    node.text = "one fish, two fish";
    node.old = "fish";
    node.new = "cat";

    expect((await node.process()).output).toBe("one cat, two cat");
  });

  it("uses an empty replacement instead of the string undefined", async () => {
    const node = new ReplaceTextNode();
    node.text = "hello world";
    node.old = " world";
    Reflect.set(node, "new", undefined);

    expect((await node.process()).output).toBe("hello");
  });
});
