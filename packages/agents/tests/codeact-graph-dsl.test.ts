/**
 * Graph authoring in a CodeAct session: the allowlist wiring, and an action
 * that really imports `@nodetool-ai/sandbox-dsl` and builds a graph.
 *
 * The pack is guest code, so a session that cannot import it cannot author a
 * graph at all. These run the real QuickJS sandbox over the real installed
 * pack — no model, no network.
 */
import { describe, it, expect } from "vitest";
import type { SandboxModuleCatalog } from "@nodetool-ai/runtime";

import {
  GRAPH_DSL_PACKAGE,
  hasGraphDslTools,
  withGraphDslPackage
} from "../src/codeact/graph-dsl-package.js";
import { createChatCodeActSession } from "../src/codeact/chat-codeact.js";
import { shippedPackCatalog } from "../src/evals/codeact-sandbox-pack-cases.js";
import type { ChatCodeActToolCall } from "../src/codeact/chat-codeact.js";

const GRAPH_TOOLS = ["create_workflow", "validate_workflow", "run_workflow"];

const toolDefs = (names: readonly string[]) =>
  names.map((name) => ({
    name,
    description: `Tool ${name}.`,
    inputSchema: { type: "object", properties: {} }
  }));

const emptyCatalog: SandboxModuleCatalog = {
  summaries: () => [],
  diagnostics: () => [],
  resolveForExecution: () => ({ modules: [], statuses: [] }),
  authorizeDelivery: () =>
    Promise.resolve({
      authorized: false as const,
      reason: "not-found" as const,
      message: "no"
    })
};

describe("graph DSL session wiring", () => {
  it("needs all three workflow verbs", () => {
    expect(hasGraphDslTools(GRAPH_TOOLS)).toBe(true);
    expect(hasGraphDslTools(["run_workflow", "validate_workflow"])).toBe(false);
  });

  it("allows the pack where the belt can author, check and run", () => {
    expect(withGraphDslPackage([], GRAPH_TOOLS, shippedPackCatalog())).toEqual([
      GRAPH_DSL_PACKAGE
    ]);
  });

  it("leaves the allowlist alone when the belt cannot author graphs", () => {
    expect(
      withGraphDslPackage(["@acme/x"], ["run_workflow"], shippedPackCatalog())
    ).toEqual(["@acme/x"]);
  });

  it("never advertises a pack this machine has not installed", () => {
    expect(withGraphDslPackage([], GRAPH_TOOLS, emptyCatalog)).toEqual([]);
    expect(withGraphDslPackage([], GRAPH_TOOLS, null)).toEqual([]);
  });

  it("adds it once when the caller already consented to it", () => {
    expect(
      withGraphDslPackage([GRAPH_DSL_PACKAGE], GRAPH_TOOLS, shippedPackCatalog())
    ).toEqual([GRAPH_DSL_PACKAGE]);
  });
});

describe("a chat session authoring a graph", () => {
  const executeTool = async (call: ChatCodeActToolCall): Promise<unknown> =>
    JSON.stringify({ ok: true, tool: call.name });

  function session() {
    return createChatCodeActSession({
      tools: toolDefs(GRAPH_TOOLS),
      executeTool,
      sandboxModuleCatalog: shippedPackCatalog()
    });
  }

  it("advertises the pack and the authoring section", () => {
    const prompt = session().systemPromptSection;
    expect(prompt).toContain(GRAPH_DSL_PACKAGE);
    expect(prompt).toContain("Authoring a workflow graph");
  });

  it("imports the pack and builds a wired graph", async () => {
    const observation = JSON.parse(
      await session().executeAction({
        code: `import { workflow } from "${GRAPH_DSL_PACKAGE}";
               import { stringInput } from "${GRAPH_DSL_PACKAGE}/nodetool.input";
               import { concat } from "${GRAPH_DSL_PACKAGE}/nodetool.text";
               import { output } from "${GRAPH_DSL_PACKAGE}/nodetool.output";
               const name = stringInput({ name: "name" });
               const line = concat({ a: name.output(), b: ", welcome!" });
               return workflow(
                 output({ name: "greeting", value: line.output() })
               );`
      })
    ) as {
      ok: boolean;
      error?: string;
      result?: {
        nodes: Array<{ id: string; type: string }>;
        edges: Array<Record<string, string>>;
      };
    };
    expect(observation.error).toBeUndefined();
    // `workflow()` walks back from its terminals, so the order is the walk's.
    expect(observation.result?.nodes.map((n) => n.type).sort()).toEqual([
      "nodetool.input.StringInput",
      "nodetool.output.Output",
      "nodetool.text.Concat"
    ]);
    expect(observation.result?.edges).toHaveLength(2);
    expect(observation.result?.edges).toContainEqual(
      expect.objectContaining({
        source: "string_input",
        sourceHandle: "output",
        target: "concat",
        targetHandle: "a"
      })
    );
  }, 60_000);

  it("refuses a namespace the pack does not export", async () => {
    const observation = JSON.parse(
      await session().executeAction({
        code: `import { anything } from "${GRAPH_DSL_PACKAGE}/nodetool.invented";
               return anything;`
      })
    ) as { ok: boolean; error?: string };
    expect(observation.ok).toBe(false);
    expect(observation.error).toContain("nodetool.invented");
  });
});
