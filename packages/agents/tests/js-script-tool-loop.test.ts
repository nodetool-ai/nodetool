/**
 * Unit tests for the JS-script surface tool-loop eval
 * (`src/evals/surfaces/js-script.ts`):
 *   - `createJsScriptToolBridge`: headless execution of the `ui_jsscript_*`
 *     tool contract against a plain in-memory document, with `run` and `test`
 *     reaching the real QuickJS sandbox.
 *   - `JS_SCRIPT_TOOL_LOOP_CASES`: each case is solvable by a hand-written
 *     scripted tool-call sequence, driven through `runToolLoopEval` exactly
 *     like a real model's tool loop — so no case can be unsatisfiable.
 */
import { describe, it, expect } from "vitest";
import { runToolLoopEval } from "../src/evals/tool-loop-eval.js";
import {
  createJsScriptToolBridge,
  JS_SCRIPT_SYSTEM_PROMPT,
  JS_SCRIPT_TOOL_LOOP_CASES,
  type JsScriptBridgeFinalState
} from "../src/evals/surfaces/js-script.js";
import type {
  BaseProvider,
  ProviderStreamItem,
  ProviderTool
} from "@nodetool-ai/runtime";

interface ScriptedCall {
  name: string;
  args: Record<string, unknown>;
}

/** Replays one scripted list of tool calls the way a provider loop would. */
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

const call = (bridge: ReturnType<typeof createJsScriptToolBridge>) =>
  async (name: string, args: Record<string, unknown> = {}) => {
    const tool = bridge.tools.find((t) => t.name === name);
    if (!tool) throw new Error(`no tool ${name}`);
    return tool.execute(args);
  };

describe("createJsScriptToolBridge", () => {
  it("exposes the eight ui_jsscript_* tools", () => {
    expect(createJsScriptToolBridge().tools.map((t) => t.name).sort()).toEqual([
      "ui_jsscript_get_state",
      "ui_jsscript_run",
      "ui_jsscript_set_code",
      "ui_jsscript_set_meta",
      "ui_jsscript_set_packages",
      "ui_jsscript_set_ports",
      "ui_jsscript_set_tests",
      "ui_jsscript_test"
    ]);
  });

  it("authors a document and runs it in the real sandbox", async () => {
    const bridge = createJsScriptToolBridge();
    const exec = call(bridge);

    await exec("ui_jsscript_set_ports", {
      inputs: [{ name: "numbers", type: "list[int]" }],
      outputs: [{ name: "total", type: "int" }]
    });
    await exec("ui_jsscript_set_code", {
      code: 'let t = 0;\nfor (const n of inputs.numbers) t += n;\nawait output("total", t);'
    });
    const run = (await exec("ui_jsscript_run", {
      inputs: { numbers: [1, 2, 3] }
    })) as { run: { ok: boolean; outputs: Record<string, unknown> } };

    expect(run.run.ok).toBe(true);
    expect(run.run.outputs).toEqual({ total: 6 });
    expect(bridge.finalState()).toMatchObject({
      inputs: ["numbers"],
      outputs: ["total"],
      valid: true,
      lastRun: { ok: true, outputs: { total: 6 } }
    });
  });

  it("returns the validation after every mutating edit", async () => {
    const bridge = createJsScriptToolBridge();
    const exec = call(bridge);
    const result = (await exec("ui_jsscript_set_code", {
      code: "return {"
    })) as { validation: { ok: boolean; errors: { code: string }[] } };

    expect(result.validation.ok).toBe(false);
    expect(result.validation.errors.map((e) => e.code)).toContain(
      "code_syntax"
    );
    expect(bridge.finalState().valid).toBe(false);
  });

  it("grades saved cases against a real run", async () => {
    const bridge = createJsScriptToolBridge({
      document: {
        code: 'await output("doubled", inputs.n * 2);',
        inputs: [{ name: "n", type: "int" }],
        outputs: [{ name: "doubled", type: "int" }],
        tests: [
          { name: "ok", inputs: { n: 2 }, expect: { doubled: 4 } },
          { name: "wrong", inputs: { n: 2 }, expect: { doubled: 5 } }
        ]
      }
    });
    const report = (await call(bridge)("ui_jsscript_test")) as {
      ok: boolean;
      passed: number;
      failed: number;
    };
    expect(report).toMatchObject({ ok: false, passed: 1, failed: 1 });
    expect(bridge.finalState().lastTest).toEqual({
      ok: false,
      passed: 1,
      failed: 1
    });
  });

  it("refuses to test a document with no saved cases", async () => {
    await expect(
      call(createJsScriptToolBridge())("ui_jsscript_test")
    ).rejects.toThrow(/no saved test cases/);
  });

  it("fails a run that emits nothing against declared outputs", async () => {
    const bridge = createJsScriptToolBridge({
      document: {
        code: "const unused = 1;",
        outputs: [
          { name: "palette", type: "list[str]" },
          { name: "hex", type: "str" }
        ]
      }
    });
    const run = (await call(bridge)("ui_jsscript_run", { inputs: {} })) as {
      ok: boolean;
      run: { ok: boolean; error?: string; outputs?: Record<string, unknown> };
    };
    expect(run.ok).toBe(false);
    expect(run.run.ok).toBe(false);
    expect(run.run.error).toContain("palette");
    expect(run.run.error).toContain("hex");
    expect(run.run.error).toContain("none of the declared outputs");
    expect(bridge.finalState().lastRun?.ok).toBe(false);
  });

  it("does not fail a run when no outputs are declared", async () => {
    const bridge = createJsScriptToolBridge({
      document: { code: "const unused = 1;" }
    });
    const run = (await call(bridge)("ui_jsscript_run", { inputs: {} })) as {
      ok: boolean;
      run: { ok: boolean };
    };
    expect(run.ok).toBe(true);
    expect(run.run.ok).toBe(true);
  });

  it("hands the document out for a host to validate afterwards", async () => {
    const bridge = createJsScriptToolBridge({ name: "Adder" });
    await call(bridge)("ui_jsscript_set_meta", { description: "Adds." });
    expect(bridge.name()).toBe("Adder");
    expect(bridge.document().description).toBe("Adds.");
  });
});

describe("JS_SCRIPT_SYSTEM_PROMPT", () => {
  it("tells the model not to treat an empty bag or zero cases as success", () => {
    expect(JS_SCRIPT_SYSTEM_PROMPT).toContain("await output");
    expect(JS_SCRIPT_SYSTEM_PROMPT).toContain("Never `return` outputs");
    expect(JS_SCRIPT_SYSTEM_PROMPT).toContain(
      "ui_jsscript_test with zero cases is an error"
    );
    expect(JS_SCRIPT_SYSTEM_PROMPT).toContain(
      "A run with declared outputs and an empty bag is not success"
    );
    expect(JS_SCRIPT_SYSTEM_PROMPT).toContain("encode");
    expect(JS_SCRIPT_SYSTEM_PROMPT).toContain("differenceCiede2000");
    expect(JS_SCRIPT_SYSTEM_PROMPT).toContain("renderSVG");
  });
});

describe("JS_SCRIPT_TOOL_LOOP_CASES", () => {
  const solve = async (id: string, script: ScriptedCall[]) => {
    const evalCase = JS_SCRIPT_TOOL_LOOP_CASES.find((c) => c.id === id);
    if (!evalCase) throw new Error(`no case ${id}`);
    const report = await runToolLoopEval<JsScriptBridgeFinalState>({
      provider: createScriptedProvider(script),
      model: "test",
      cases: [evalCase]
    });
    return report.cases[0];
  };

  it("has four cases with the expected ids", () => {
    expect(JS_SCRIPT_TOOL_LOOP_CASES.map((c) => c.id)).toEqual([
      "author-sum-script",
      "add-saved-tests",
      "expose-as-custom-node",
      "repair-failing-test"
    ]);
  });

  it("author-sum-script is solved by declaring ports, writing a body and running it", async () => {
    const result = await solve("author-sum-script", [
      { name: "ui_jsscript_get_state", args: {} },
      {
        name: "ui_jsscript_set_ports",
        args: {
          inputs: [{ name: "numbers", type: "list[int]" }],
          outputs: [{ name: "total", type: "int" }]
        }
      },
      {
        name: "ui_jsscript_set_code",
        args: {
          code: 'let t = 0;\nfor (const n of inputs.numbers) t += n;\nawait output("total", t);'
        }
      },
      { name: "ui_jsscript_run", args: { inputs: { numbers: [1, 2, 3] } } }
    ]);
    expect(result.checks.filter((c) => !c.pass)).toEqual([]);
    expect(result.score).toBe(1);
  });

  it("add-saved-tests is solved by saving two cases and running them green", async () => {
    const result = await solve("add-saved-tests", [
      { name: "ui_jsscript_get_state", args: {} },
      {
        name: "ui_jsscript_set_tests",
        args: {
          tests: [
            { name: "lowercase", inputs: { text: "hi" }, expect: { upper: "HI" } },
            { name: "mixed", inputs: { text: "Hi There" }, expect: { upper: "HI THERE" } }
          ]
        }
      },
      { name: "ui_jsscript_test", args: {} }
    ]);
    expect(result.checks.filter((c) => !c.pass)).toEqual([]);
    expect(result.score).toBe(1);
  });

  it("expose-as-custom-node is solved by one set_meta call", async () => {
    const result = await solve("expose-as-custom-node", [
      { name: "ui_jsscript_get_state", args: {} },
      {
        name: "ui_jsscript_set_meta",
        args: {
          description: "Turns a title into a URL slug.",
          palette: { category: "Text" }
        }
      }
    ]);
    expect(result.checks.filter((c) => !c.pass)).toEqual([]);
    expect(result.score).toBe(1);
  });

  it("scores a model that renames the ports while exposing the script as a miss", async () => {
    const result = await solve("expose-as-custom-node", [
      {
        name: "ui_jsscript_set_meta",
        args: {
          description: "Turns a title into a URL slug.",
          palette: { category: "Text" }
        }
      },
      {
        name: "ui_jsscript_set_ports",
        args: { inputs: [{ name: "text", type: "str" }] }
      }
    ]);
    expect(result.checks.some((c) => !c.pass)).toBe(true);
    expect(result.score).toBeLessThan(1);
  });

  it("repair-failing-test is solved by fixing the body, not the case", async () => {
    const result = await solve("repair-failing-test", [
      { name: "ui_jsscript_test", args: {} },
      {
        name: "ui_jsscript_set_code",
        args: { code: 'await output("doubled", inputs.n * 2);' }
      },
      { name: "ui_jsscript_test", args: {} }
    ]);
    expect(result.checks.filter((c) => !c.pass)).toEqual([]);
    expect(result.score).toBe(1);
  });

  it("scores a model that deletes the failing case instead of fixing it as a miss", async () => {
    const result = await solve("repair-failing-test", [
      { name: "ui_jsscript_test", args: {} },
      { name: "ui_jsscript_set_code", args: { code: 'await output("doubled", 0);' } },
      { name: "ui_jsscript_set_tests", args: { tests: [] } }
    ]);
    expect(result.checks.some((c) => !c.pass)).toBe(true);
    expect(result.score).toBeLessThan(1);
  });
});
