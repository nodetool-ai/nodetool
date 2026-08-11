/**
 * The `code` capability module — the Code-node authoring harness.
 *
 * Real QuickJS sandbox, no network: validate_code over the node-sdk static
 * check, run_code with implicit return / explicit return / yield streaming,
 * and test_code grading cases against expected outputs.
 */

import { describe, it, expect } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  ValidateCodeTool,
  RunCodeTool,
  TestCodeTool
} from "../src/tools/code-authoring-tools.js";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";
import { BUILTIN_TOOL_CLASSES } from "../src/tools/builtin-tools.js";
import { createMockContext } from "./_helpers/mock-context.js";

const context = () => createMockContext() as unknown as ProcessingContext;

describe("validate_code", () => {
  it("passes a clean body and reports its issues structurally", async () => {
    const tool = new ValidateCodeTool();
    const clean = (await tool.execute(context(), {
      code: "return { sum: inputs.a + inputs.b };",
      inputs: ["a", "b"],
      outputs: ["sum"]
    })) as { ok: boolean; issues: unknown[] };
    expect(clean.ok).toBe(true);
    expect(clean.issues).toEqual([]);
  });

  it("flags syntax errors, undeclared inputs, and missing outputs", async () => {
    const tool = new ValidateCodeTool();
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
    const tool = new RunCodeTool();
    const result = (await tool.execute(context(), {
      code: 'console.log("computing"); return { sum: inputs.a + inputs.b };',
      inputs: { a: 2, b: 3 }
    })) as { ok: boolean; outputs: Record<string, unknown>; logs: string[] };
    expect(result.ok).toBe(true);
    expect(result.outputs).toEqual({ sum: 5 });
    expect(result.logs).toContain("computing");
  });

  it("wraps an implicit return the way the Code node does", async () => {
    const tool = new RunCodeTool();
    const result = (await tool.execute(context(), {
      code: "({ doubled: inputs.x * 2 })",
      inputs: { x: 4 }
    })) as { ok: boolean; outputs: Record<string, unknown> };
    expect(result.ok).toBe(true);
    expect(result.outputs).toEqual({ doubled: 8 });
  });

  it("collects yield into streamed items", async () => {
    const tool = new RunCodeTool();
    const result = (await tool.execute(context(), {
      code: "for (const item of inputs.items) { yield ({ item }); }",
      inputs: { items: ["a", "b"] }
    })) as { ok: boolean; streamed: Record<string, unknown>[] };
    expect(result.ok).toBe(true);
    expect(result.streamed).toEqual([{ item: "a" }, { item: "b" }]);
  });

  it("reports a thrown error instead of throwing", async () => {
    const tool = new RunCodeTool();
    const result = (await tool.execute(context(), {
      code: 'throw new Error("boom");'
    })) as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toContain("boom");
  });

  it("denies secrets by default", async () => {
    const tool = new RunCodeTool();
    const result = (await tool.execute(context(), {
      code: 'return { key: await getSecret("OPENAI_API_KEY") };'
    })) as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toContain("declares no secrets");
  });

  it("refuses declared packages when no catalog is mounted", async () => {
    const tool = new RunCodeTool();
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
    const tool = new TestCodeTool();
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

  it("rejects an empty case list", async () => {
    const tool = new TestCodeTool();
    const result = (await tool.execute(context(), {
      code: "return {};",
      cases: []
    })) as { error: string };
    expect(result.error).toContain("at least one case");
  });
});

describe("registration", () => {
  it("is on the builtin belt with the pinned categories", () => {
    const names = BUILTIN_TOOL_CLASSES.map((Cls) => new Cls().name);
    expect(names).toContain("validate_code");
    expect(names).toContain("run_code");
    expect(names).toContain("test_code");
    expect(permissionCategoryFor("validate_code")).toBe("read");
    expect(permissionCategoryFor("run_code")).toBe("execute");
    expect(permissionCategoryFor("test_code")).toBe("execute");
  });
});
