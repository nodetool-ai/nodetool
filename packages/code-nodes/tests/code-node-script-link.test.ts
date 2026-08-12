/**
 * A Code node linked to a JS script runs the pinned version's body.
 *
 * The resolver is stubbed: what these check is the node's behavior around it —
 * that the script's envelope replaces the node's own, that a dangling link
 * fails instead of falling back to the stale inline body, and that a script
 * whose declared inputs the node cannot feed fails before it runs.
 */
import { describe, it, expect } from "vitest";
import { CodeNode } from "@nodetool-ai/code-nodes";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  emptyJsScriptDocument,
  type JsScriptDocument,
  type ResolvedJsScript
} from "@nodetool-ai/protocol/api-schemas/js-scripts.js";

const scriptDocument = (
  overrides: Partial<JsScriptDocument>
): JsScriptDocument => ({ ...emptyJsScriptDocument(), ...overrides });

/** A context whose resolver answers for exactly the links in `scripts`. */
function contextWith(
  scripts: Record<string, ResolvedJsScript>
): ProcessingContext {
  return {
    workflowId: "wf-test",
    userId: "1",
    postMessage: () => {},
    jsScriptResolver: {
      resolve: async (link: { id: string; version: number }) =>
        scripts[`${link.id}@${link.version}`] ?? null
    }
  } as unknown as ProcessingContext;
}

async function collect(
  node: CodeNode,
  context: ProcessingContext
): Promise<Record<string, unknown>[]> {
  const bags: Record<string, unknown>[] = [];
  for await (const bag of node.genProcess(context)) bags.push(bag);
  return bags;
}

describe("CodeNode — linked script", () => {
  it("runs the pinned version's body and ignores the inline code", async () => {
    const context = contextWith({
      "s1@3": {
        id: "s1",
        name: "Doubler",
        version: 3,
        document: scriptDocument({
          code: 'await output("doubled", inputs.value * 2);',
          inputs: [{ name: "value", type: "int" }],
          outputs: [{ name: "doubled", type: "int" }]
        })
      }
    });
    const node = new CodeNode({
      code: 'await output("doubled", "the inline body ran");',
      script: { id: "s1", version: 3 },
      value: 21
    });

    expect(await collect(node, context)).toEqual([{ doubled: 42 }]);
  });

  it("runs the pinned version, not whatever the script says now", async () => {
    const context = contextWith({
      "s1@1": {
        id: "s1",
        name: "Greeter",
        version: 1,
        document: scriptDocument({
          code: 'await output("greeting", "v1");',
          outputs: [{ name: "greeting", type: "str" }]
        })
      },
      "s1@2": {
        id: "s1",
        name: "Greeter",
        version: 2,
        document: scriptDocument({
          code: 'await output("greeting", "v2");',
          outputs: [{ name: "greeting", type: "str" }]
        })
      }
    });
    const node = new CodeNode({ code: "", script: { id: "s1", version: 1 } });

    expect(await collect(node, context)).toEqual([{ greeting: "v1" }]);
  });

  it("fails on a dangling link instead of running the inline body", async () => {
    const context = contextWith({});
    const node = new CodeNode({
      code: 'await output("out", "inline");',
      script: { id: "gone", version: 2 }
    });

    await expect(node.process(context)).rejects.toThrow(/was not found/);
  });

  it("fails when the script declares an input the node has no slot for", async () => {
    const context = contextWith({
      "s1@1": {
        id: "s1",
        name: "Needs two",
        version: 1,
        document: scriptDocument({
          code: 'await output("sum", inputs.a + inputs.b);',
          inputs: [
            { name: "a", type: "int" },
            { name: "b", type: "int" }
          ],
          outputs: [{ name: "sum", type: "int" }]
        })
      }
    });
    const node = new CodeNode({ code: "", script: { id: "s1", version: 1 }, a: 1 });

    await expect(node.process(context)).rejects.toThrow(/"b"/);
  });

  it("fails when no resolver is installed in this process", async () => {
    const context = {
      workflowId: "wf-test",
      postMessage: () => {},
      jsScriptResolver: null
    } as unknown as ProcessingContext;
    const node = new CodeNode({ code: "", script: { id: "s1", version: 1 } });

    await expect(node.process(context)).rejects.toThrow(/no script resolver/);
  });

  it("runs its own body when the link is empty", async () => {
    const context = contextWith({});
    const node = new CodeNode({
      code: 'await output("out", "inline");',
      script: {}
    });

    expect(await node.process(context)).toEqual({ out: "inline" });
  });
});
