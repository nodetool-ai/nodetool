/**
 * A Code node linked to a JS script runs the body the link materialized.
 *
 * Linking copies the pinned version's code, packages, secrets and timeout onto
 * the node; the `script` property records only where they came from. So these
 * check that execution reads the node and nothing else: no resolver on the
 * context, no database, and the same hydration answer an inline body gets.
 */
import { describe, it, expect } from "vitest";
import { CodeNode } from "@nodetool-ai/code-nodes";
import type { ProcessingContext } from "@nodetool-ai/runtime";

/** A context with no script storage of any kind. */
function bareContext(): ProcessingContext {
  return {
    workflowId: "wf-test",
    userId: "1",
    postMessage: () => {}
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
  it("runs the materialized body with no resolver on the context", async () => {
    const node = new CodeNode({
      code: 'await output("doubled", inputs.value * 2);',
      script: { id: "s1", version: 3 },
      value: 21
    });

    expect(await collect(node, bareContext())).toEqual([{ doubled: 42 }]);
  });

  it("runs even when the linked script no longer exists", async () => {
    const node = new CodeNode({
      code: 'await output("out", "materialized");',
      script: { id: "gone", version: 2 }
    });

    expect(await node.process(bareContext())).toEqual({ out: "materialized" });
  });

  it("runs its own body when the link is empty", async () => {
    const node = new CodeNode({
      code: 'await output("out", "inline");',
      script: {}
    });

    expect(await node.process(bareContext())).toEqual({ out: "inline" });
  });

  it("hydrates a linked streaming script into streaming-input mode", () => {
    const streaming = CodeNode.resolveStreamingInput?.({
      properties: {
        script: { id: "s1", version: 1 },
        code:
          'let total = 0;\nfor await (const n of stream("numbers")) {\n' +
          '  total += n;\n  await emit("running", total);\n}\n' +
          'await output("total", total);'
      }
    });
    const buffered = CodeNode.resolveStreamingInput?.({
      properties: {
        script: { id: "s1", version: 1 },
        code: 'await output("total", inputs.numbers.length);'
      }
    });

    expect(streaming).toBe(true);
    expect(buffered).toBe(false);
  });
});
