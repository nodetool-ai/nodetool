/**
 * The text-documents tool-loop eval (`src/evals/surfaces/text-documents.ts`):
 * each case is solvable by a hand-written tool sequence driven through
 * `runToolLoopEval` like a real model's loop, and a sequence that misses the
 * point fails it. No network.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ModelObserver } from "@nodetool-ai/models";
import { setProjectFolderResolver, type BaseProvider, type ProviderStreamItem, type ProviderTool } from "@nodetool-ai/runtime";
import { runToolLoopEval } from "../src/evals/tool-loop-eval.js";
import { TEXT_DOCUMENTS_TOOL_LOOP_CASES } from "../src/evals/surfaces/text-documents.js";

interface ScriptedCall {
  name: string;
  args: Record<string, unknown> | (() => Record<string, unknown>);
  capture?: (result: unknown) => void;
}

function scriptedProvider(script: ScriptedCall[]): BaseProvider {
  return {
    provider: "scripted",
    hasToolSupport: async () => true,
    getTotalCost: () => 0,
    async *generateLoop(args: { tools?: ProviderTool[] }): AsyncGenerator<ProviderStreamItem> {
      const tools = new Map((args.tools ?? []).map((t) => [t.name, t]));
      let seq = 0;
      for (const call of script) {
        const id = `call_${++seq}`;
        const callArgs = typeof call.args === "function" ? call.args() : call.args;
        yield { id, name: call.name, args: callArgs } as ProviderStreamItem;
        const raw = await tools.get(call.name)?.execute?.(callArgs, id);
        call.capture?.(typeof raw === "string" ? JSON.parse(raw) : raw);
      }
      yield { type: "chunk", content: "", done: true } as ProviderStreamItem;
    }
  } as unknown as BaseProvider;
}

const caseById = (id: string) => {
  const found = TEXT_DOCUMENTS_TOOL_LOOP_CASES.find((c) => c.id === id);
  if (!found) throw new Error(`no case ${id}`);
  return found;
};

async function score(id: string, script: ScriptedCall[]): Promise<number> {
  const report = await runToolLoopEval({
    provider: scriptedProvider(script),
    model: "scripted",
    cases: [caseById(id)],
    maxIterations: 10
  });
  return report.cases[0].score;
}

afterEach(() => {
  ModelObserver.clear();
  setProjectFolderResolver(null);
});

describe("TEXT_DOCUMENTS_TOOL_LOOP_CASES (scripted provider)", () => {
  it("revise-launch-plan passes with a targeted edit", async () => {
    expect(
      await score("revise-launch-plan", [
        { name: "read_document", args: { path: "launch-plan.md" } },
        {
          name: "edit_document",
          args: {
            path: "launch-plan.md",
            edits: [{ old_text: "March 3", new_text: "March 10" }]
          }
        },
        {
          name: "edit_document",
          args: {
            path: "launch-plan.md",
            append: "## Risks\n\n- Support staffing over the launch week"
          }
        }
      ])
    ).toBe(1);
  });

  it("revise-launch-plan fails when the rewrite drops the channel list", async () => {
    expect(
      await score("revise-launch-plan", [
        { name: "read_document", args: { path: "launch-plan.md" } },
        {
          name: "edit_document",
          args: {
            path: "launch-plan.md",
            content: "# Launch plan\n\nLaunch date: March 10\n\n## Risks\n\n- Support staffing\n"
          }
        }
      ])
    ).toBeLessThan(1);
  });

  it("restore-earlier-price passes by restoring the version before the change", async () => {
    let version = 0;
    expect(
      await score("restore-earlier-price", [
        {
          name: "list_document_versions",
          args: { path: "pricing.md" },
          capture: (result) => {
            const versions = (result as { versions: { version: number }[] }).versions;
            version = versions[versions.length - 1]?.version ?? 0;
          }
        },
        { name: "restore_document_version", args: () => ({ path: "pricing.md", version }) }
      ])
    ).toBe(1);
  });

  it("restore-earlier-price fails when the price is retyped instead", async () => {
    expect(
      await score("restore-earlier-price", [
        { name: "list_document_versions", args: { path: "pricing.md" } },
        {
          name: "edit_document",
          args: { path: "pricing.md", edits: [{ old_text: "$59", new_text: "$49" }] }
        }
      ])
    ).toBeLessThan(1);
  });
});
