/**
 * Platform modules inside `nodetool.code.Code`.
 *
 * `@nodetool-ai/sandbox-nodetool/<namespace>` is NodeTool's own guest surface,
 * not a pack: the host mounts it for the namespaces a body imports, and a Code
 * node body may therefore import one without declaring anything in `packages`.
 * These tests drive the mount itself — that the facade resolves, and that a
 * namespace nobody registers is refused by name before the guest starts.
 */
import { describe, it, expect } from "vitest";
import { CodeNode } from "@nodetool-ai/code-nodes";
import type { ProcessingContext } from "@nodetool-ai/runtime";

/** The mount reads no context field; it only needs one to exist. */
const fakeContext = {} as unknown as ProcessingContext;

function runNode(code: string): Promise<Record<string, unknown>> {
  return new CodeNode({ code }).process(fakeContext);
}

describe("CodeNode — capability modules", () => {
  it("mounts the flow module for a body that imports it", async () => {
    const outputs = await runNode(
      `
      import { invoke_node, open_node_stream, take_node_stream, close_node_stream }
        from "@nodetool-ai/sandbox-nodetool/flow";
      await output("kinds", [
        typeof invoke_node,
        typeof open_node_stream,
        typeof take_node_stream,
        typeof close_node_stream
      ].join(","));
      `
    );
    expect(outputs).toEqual({
      kinds: "function,function,function,function"
    });
  }, 60_000);

  it("refuses a namespace no capability module registers", async () => {
    await expect(
      runNode(
        `
        import { anything } from "@nodetool-ai/sandbox-nodetool/not-a-namespace";
        await output("out", typeof anything);
        `
      )
    ).rejects.toThrow(/not a NodeTool capability module/);
  }, 60_000);
});
