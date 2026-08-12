/**
 * The `code` capability module — the Code-node authoring harness.
 *
 * Real QuickJS sandbox, no network: validate_code over the node-sdk static
 * check, run_code on both output contracts (emit/output, and the deprecated
 * implicit return / explicit return / yield streaming), and test_code grading
 * cases against expected finals and expected emits.
 */

import { describe, it, expect } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { toolForCapabilityName } from "../src/capabilities/index.js";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";
import { BUILTIN_TOOL_NAMES } from "../src/tools/builtin-tools.js";
import { createMockContext } from "./_helpers/mock-context.js";

const context = () => createMockContext() as unknown as ProcessingContext;

describe("validate_code", () => {
  it("passes a clean body and reports its issues structurally", async () => {
    const tool = toolForCapabilityName("validate_code");
    const clean = (await tool.execute(context(), {
      code: 'await output("sum", inputs.a + inputs.b);',
      inputs: ["a", "b"],
      outputs: ["sum"]
    })) as { ok: boolean; issues: unknown[] };
    expect(clean.ok).toBe(true);
    expect(clean.issues).toEqual([]);
  });

  it("warns once that a legacy return body is deprecated", async () => {
    const tool = toolForCapabilityName("validate_code");
    const legacy = (await tool.execute(context(), {
      code: "return { sum: inputs.a + inputs.b };",
      inputs: ["a", "b"],
      outputs: ["sum"]
    })) as {
      ok: boolean;
      issues: { severity: string; code: string; message: string }[];
    };
    expect(legacy.ok).toBe(true);
    const deprecations = legacy.issues.filter((issue) =>
      /deprecat/i.test(issue.message)
    );
    expect(deprecations).toHaveLength(1);
    expect(deprecations[0]?.severity).toBe("warning");
    expect(deprecations[0]?.message).toContain("emit(name, value)");
  });

  it("flags syntax errors, undeclared inputs, and missing outputs", async () => {
    const tool = toolForCapabilityName("validate_code");
    const syntax = (await tool.execute(context(), {
      code: "return {"
    })) as { ok: boolean; issues: { code: string }[] };
    expect(syntax.ok).toBe(false);
    expect(syntax.issues[0]?.code).toBe("code_syntax");

    const undeclared = (await tool.execute(context(), {
      code: "return { out: inputs.missing };",
      inputs: ["a"],
      outputs: ["out"]
    })) as { ok: boolean; issues: { code: string }[] };
    expect(undeclared.ok).toBe(false);
    expect(
      undeclared.issues.some((issue) => issue.code === "code_undefined_input")
    ).toBe(true);

    // A declared output the code never sets is a warning, so ok stays true.
    const missing = (await tool.execute(context(), {
      code: "return { other: 1 };",
      outputs: ["wanted"]
    })) as { ok: boolean; issues: { code: string; severity: string }[] };
    expect(missing.ok).toBe(true);
    expect(
      missing.issues.some(
        (issue) =>
          issue.code === "code_missing_output" && issue.severity === "warning"
      )
    ).toBe(true);
  });
});

describe("run_code", () => {
  it("runs a body with inputs and returns outputs + logs", async () => {
    const tool = toolForCapabilityName("run_code");
    const result = (await tool.execute(context(), {
      code: 'console.log("computing"); return { sum: inputs.a + inputs.b };',
      inputs: { a: 2, b: 3 }
    })) as { ok: boolean; outputs: Record<string, unknown>; logs: string[] };
    expect(result.ok).toBe(true);
    expect(result.outputs).toEqual({ sum: 5 });
    expect(result.logs).toContain("computing");
  });

  it("wraps an implicit return the way the Code node does", async () => {
    const tool = toolForCapabilityName("run_code");
    const result = (await tool.execute(context(), {
      code: "({ doubled: inputs.x * 2 })",
      inputs: { x: 4 }
    })) as { ok: boolean; outputs: Record<string, unknown> };
    expect(result.ok).toBe(true);
    expect(result.outputs).toEqual({ doubled: 8 });
  });

  it("collects yield into streamed items", async () => {
    const tool = toolForCapabilityName("run_code");
    const result = (await tool.execute(context(), {
      code: "for (const item of inputs.items) { yield ({ item }); }",
      inputs: { items: ["a", "b"] }
    })) as { ok: boolean; streamed: Record<string, unknown>[] };
    expect(result.ok).toBe(true);
    expect(result.streamed).toEqual([{ item: "a" }, { item: "b" }]);
  });

  it("reports emits as streamed entries and output() calls as outputs", async () => {
    const tool = toolForCapabilityName("run_code");
    const result = (await tool.execute(context(), {
      code: `for (const item of inputs.items) { await emit("row", item); }
await output("count", inputs.items.length);
return { ignored: true };`,
      inputs: { items: ["a", "b"] }
    })) as {
      ok: boolean;
      outputs: Record<string, unknown>;
      streamed: { name: string; value: unknown }[];
    };
    expect(result.ok).toBe(true);
    expect(result.streamed).toEqual([
      { name: "row", value: "a" },
      { name: "row", value: "b" }
    ]);
    // `return` is control flow on this path — its value never reaches outputs.
    expect(result.outputs).toEqual({ count: 2 });
  });

  it("reports a thrown error instead of throwing", async () => {
    const tool = toolForCapabilityName("run_code");
    const result = (await tool.execute(context(), {
      code: 'throw new Error("boom");'
    })) as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toContain("boom");
  });

  it("denies secrets by default", async () => {
    const tool = toolForCapabilityName("run_code");
    const result = (await tool.execute(context(), {
      code: 'return { key: await getSecret("OPENAI_API_KEY") };'
    })) as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toContain("declares no secrets");
  });

  it("refuses declared packages when no catalog is mounted", async () => {
    const tool = toolForCapabilityName("run_code");
    const result = (await tool.execute(context(), {
      code: "return {};",
      packages: ["@nodetool-ai/sandbox-yaml"]
    })) as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Sandbox packages are not available");
  });
});

describe("test_code", () => {
  it("grades cases against expected outputs", async () => {
    const tool = toolForCapabilityName("test_code");
    const result = (await tool.execute(context(), {
      code: "return { sum: inputs.a + inputs.b };",
      cases: [
        { name: "adds", inputs: { a: 1, b: 2 }, expect: { sum: 3 } },
        { name: "wrong", inputs: { a: 1, b: 2 }, expect: { sum: 4 } },
        { name: "runs", inputs: { a: 0, b: 0 } }
      ]
    })) as {
      ok: boolean;
      passed: number;
      failed: number;
      results: {
        name: string;
        ok: boolean;
        mismatches: { output: string; expected: unknown; actual: unknown }[];
      }[];
    };
    expect(result.ok).toBe(false);
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(1);
    const wrong = result.results.find((entry) => entry.name === "wrong");
    expect(wrong?.mismatches).toEqual([
      { output: "sum", expected: 4, actual: 3 }
    ]);
  });

  it("grades cases against expected_streamed", async () => {
    const tool = toolForCapabilityName("test_code");
    const result = (await tool.execute(context(), {
      code: `for (const n of inputs.items) { await emit("n", n); }
await output("total", inputs.items.length);`,
      cases: [
        {
          name: "streams both",
          inputs: { items: [1, 2] },
          expected_streamed: [
            { name: "n", value: 1 },
            { name: "n", value: 2 }
          ],
          expect: { total: 2 }
        },
        {
          name: "wrong value",
          inputs: { items: [1, 2] },
          expected_streamed: [
            { name: "n", value: 1 },
            { name: "n", value: 99 }
          ]
        },
        {
          name: "wrong length",
          inputs: { items: [1, 2] },
          expected_streamed: [{ name: "n", value: 1 }]
        }
      ]
    })) as {
      ok: boolean;
      passed: number;
      failed: number;
      results: {
        name: string;
        ok: boolean;
        mismatches: { output: string; expected: unknown; actual: unknown }[];
      }[];
    };
    expect(result.ok).toBe(false);
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(2);

    const wrongValue = result.results.find(
      (entry) => entry.name === "wrong value"
    );
    expect(wrongValue?.mismatches).toEqual([
      {
        output: "streamed[1]",
        expected: { name: "n", value: 99 },
        actual: { name: "n", value: 2 }
      }
    ]);

    const wrongLength = result.results.find(
      (entry) => entry.name === "wrong length"
    );
    expect(wrongLength?.mismatches).toEqual([
      {
        output: "streamed",
        expected: [{ name: "n", value: 1 }],
        actual: [
          { name: "n", value: 1 },
          { name: "n", value: 2 }
        ]
      }
    ]);
  });

  it("rejects an empty case list", async () => {
    const tool = toolForCapabilityName("test_code");
    const result = (await tool.execute(context(), {
      code: "return {};",
      cases: []
    })) as { error: string };
    expect(result.error).toContain("at least one case");
  });
});

describe("registration", () => {
  it("is on the builtin belt with the pinned categories", () => {
    expect(BUILTIN_TOOL_NAMES).toContain("validate_code");
    expect(BUILTIN_TOOL_NAMES).toContain("run_code");
    expect(BUILTIN_TOOL_NAMES).toContain("test_code");
    expect(permissionCategoryFor("validate_code")).toBe("read");
    expect(permissionCategoryFor("run_code")).toBe("execute");
    expect(permissionCategoryFor("test_code")).toBe("execute");
  });
});
