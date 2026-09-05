import { describe, expect, it } from "vitest";

import { ConcatTextNode } from "@nodetool-ai/text-nodes";

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

describe("empty prop bag materializes the descriptor default", () => {
  it("SaveTextNode names the file from the descriptor default, not \"output.txt\"", async () => {
    const { SaveTextNode } = await import("@nodetool-ai/text-nodes");
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "savetext-"));

    // The same path `nodetool node run <type> --props '{}'` takes: the
    // constructor calls assign({}), which materializes every declared default.
    const node = new SaveTextNode();
    node.assign({ text: "hello", folder: dir });
    const { output } = await node.process();

    const written = path.basename(output.uri);
    expect(written).not.toBe("output.txt");
    expect(written).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.txt$/);
    expect(await fs.readFile(output.uri, "utf-8")).toBe("hello");
  });

  it("LoadTextFolderNode scans every descriptor extension, not just .txt", async () => {
    const { LoadTextFolderNode } = await import("@nodetool-ai/text-nodes");
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "loadtext-"));
    await fs.writeFile(path.join(dir, "a.md"), "markdown");

    const node = new LoadTextFolderNode();
    node.assign({ folder: dir });
    const { paths, text } = await node.process();

    expect(paths).toHaveLength(1);
    expect(text).toBe("markdown");
  });
});
