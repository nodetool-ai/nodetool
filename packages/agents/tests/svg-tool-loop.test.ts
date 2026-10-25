/**
 * Tests for the SVG editor headless tool-loop surface
 * (`src/evals/surfaces/svg.ts`):
 *   - `createSvgToolBridge`: the shared `ui_svg_*` contract run against an
 *     in-memory draft.
 *   - `SVG_TOOL_LOOP_CASES`: a golden transcript per case passes, so no case
 *     is unsatisfiable, and a plausible wrong run fails.
 */
import { describe, it, expect } from "vitest";
import type { BaseProvider, ProviderStreamItem, ProviderTool } from "@nodetool-ai/runtime";
import { SVG_TOOL_CONTRACTS } from "@nodetool-ai/protocol/api-schemas/asset-editor-tool-contracts.js";
import { runToolLoopEval } from "../src/evals/tool-loop-eval.js";
import {
  createSvgToolBridge,
  svgMarkupIssues,
  SVG_TOOL_LOOP_CASES
} from "../src/evals/surfaces/svg.js";

interface ScriptedCall {
  name: string;
  args: Record<string, unknown>;
}

function createScriptedProvider(script: ScriptedCall[]): BaseProvider {
  return {
    provider: "scripted",
    hasToolSupport: async () => true,
    getTotalCost: () => 0,
    async *generateLoop(args: {
      tools?: ProviderTool[];
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      const toolMap = new Map((args.tools ?? []).map((t) => [t.name, t]));
      let seq = 0;
      for (const call of script) {
        if (args.signal?.aborted) break;
        const id = `call_${++seq}`;
        yield { id, name: call.name, args: call.args } as ProviderStreamItem;
        await toolMap.get(call.name)?.execute?.(call.args, id);
      }
      yield { type: "chunk", content: "", done: true } as ProviderStreamItem;
    }
  } as unknown as BaseProvider;
}

const caseById = (id: string) => {
  const found = SVG_TOOL_LOOP_CASES.find((c) => c.id === id);
  if (!found) throw new Error(`no case ${id}`);
  return found;
};

const run = async (id: string, script: ScriptedCall[]) => {
  const report = await runToolLoopEval({
    provider: createScriptedProvider(script),
    model: "test-model",
    cases: [caseById(id)]
  });
  return report.cases[0];
};

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><circle fill="blue"/></svg>';

describe("svgMarkupIssues", () => {
  it("accepts an SVG document", () => {
    expect(svgMarkupIssues(SVG)).toEqual([]);
    expect(svgMarkupIssues(`<?xml version="1.0"?>\n${SVG}`)).toEqual([]);
  });

  it("reports markup that is not well-formed", () => {
    expect(svgMarkupIssues("<svg><g></svg>")).toHaveLength(1);
  });

  it("reports a root that is not <svg>", () => {
    expect(svgMarkupIssues("<div/>")).toEqual([
      "The root element is <div>, not <svg>."
    ]);
  });
});

describe("createSvgToolBridge", () => {
  it("registers every shared ui_svg_* contract and nothing else", () => {
    const bridge = createSvgToolBridge({ markup: SVG });
    expect(bridge.tools.map((t) => t.name).sort()).toEqual(
      Object.keys(SVG_TOOL_CONTRACTS).sort()
    );
    for (const tool of bridge.tools) {
      expect(tool.description).toBe(
        SVG_TOOL_CONTRACTS[tool.name as keyof typeof SVG_TOOL_CONTRACTS].description
      );
    }
  });

  it("edits the draft, refuses broken markup, and saves", async () => {
    const bridge = createSvgToolBridge({ markup: SVG });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    await byName.ui_svg_replace.execute({ find: 'fill="blue"', replace: 'fill="red"' });
    expect(bridge.finalState()).toMatchObject({ dirty: true, saves: 0 });
    expect(bridge.finalState().markup).toContain('fill="red"');

    await expect(
      byName.ui_svg_set_markup.execute({ markup: "<svg><g>" })
    ).rejects.toThrow("The markup was not applied");
    await expect(
      byName.ui_svg_replace.execute({ find: "</svg>", replace: "" })
    ).rejects.toThrow("The replacement was not applied");
    await expect(
      byName.ui_svg_replace.execute({ find: "green", replace: "" })
    ).rejects.toThrow("does not occur");
    expect(bridge.finalState().markup).toContain('fill="red"');

    await byName.ui_svg_save.execute({});
    expect(bridge.finalState()).toMatchObject({ dirty: false, saves: 1 });
  });
});

describe("SVG_TOOL_LOOP_CASES", () => {
  it("recolor-and-save passes on the golden transcript", async () => {
    const result = await run("recolor-and-save", [
      { name: "ui_svg_get_state", args: {} },
      { name: "ui_svg_replace", args: { find: 'fill="#1e64ff"', replace: 'fill="#ff0000"' } },
      { name: "ui_svg_save", args: {} }
    ]);
    expect(result.accepted).toBe(true);
    expect(result.score).toBe(1);
  });

  it("recolor-and-save fails when the edit is never saved", async () => {
    const result = await run("recolor-and-save", [
      { name: "ui_svg_get_state", args: {} },
      { name: "ui_svg_replace", args: { find: 'fill="#1e64ff"', replace: 'fill="red"' } }
    ]);
    expect(result.score).toBeLessThan(1);
  });

  it("add-background passes on the golden transcript", async () => {
    const result = await run("add-background", [
      { name: "ui_svg_get_state", args: {} },
      {
        name: "ui_svg_replace",
        args: {
          find: '<circle id="dot"',
          replace: '<rect width="100" height="100" fill="#eeeeee"/>\n  <circle id="dot"'
        }
      }
    ]);
    expect(result.accepted).toBe(true);
    expect(result.score).toBe(1);
  });

  it("remove-label passes on the golden transcript and fails when saved", async () => {
    const golden: ScriptedCall[] = [
      { name: "ui_svg_get_state", args: {} },
      {
        name: "ui_svg_replace",
        args: {
          find: '<text id="label" x="50" y="95" text-anchor="middle" font-size="10">Draft</text>',
          replace: ""
        }
      }
    ];
    const passed = await run("remove-label", golden);
    expect(passed.accepted).toBe(true);
    expect(passed.score).toBe(1);

    const saved = await run("remove-label", [...golden, { name: "ui_svg_save", args: {} }]);
    expect(saved.score).toBeLessThan(1);
  });
});
