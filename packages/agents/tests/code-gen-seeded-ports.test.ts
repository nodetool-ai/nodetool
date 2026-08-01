/**
 * Seeded handle contracts.
 *
 * The two handle entry points create the edge before the model runs, so the
 * edge already names a handle the submission has to produce. A submission that
 * renames, drops, or incompatibly retypes one of those ports would leave the
 * edge attached to a handle the node does not have — a broken graph that passes
 * every self-consistency check the transport schema can make.
 */
import { describe, it, expect } from "vitest";
import { SubmitCodeTool } from "../src/tools/submit-code-tool.js";
import { portTypesCompatible } from "../src/code-gen/port-types.js";

const STR = { type: "str" };
const INT = { type: "int" };

const context = {} as never;

/** A submission whose ports the individual tests vary. */
const submission = (
  inputs: { name: string; type: unknown }[],
  outputs: { name: string; type: unknown }[]
) => ({
  title: "Count the words",
  summary: "Counts whitespace-separated words in the text.",
  code: "const words = String(text ?? '').split(' ');\nreturn { count: words.length };",
  inputs,
  outputs
});

type Result = { status: string; errors?: string[] };

describe("portTypesCompatible", () => {
  it("accepts identical and any-widened types", () => {
    expect(portTypesCompatible(STR, STR)).toBe(true);
    expect(portTypesCompatible(STR, { type: "any" })).toBe(true);
    expect(portTypesCompatible({ type: "any" }, STR)).toBe(true);
  });

  it("accepts an alias spelling of the same type", () => {
    expect(portTypesCompatible(INT, { type: "integer" })).toBe(true);
  });

  it("rejects a different scalar", () => {
    expect(portTypesCompatible({ type: "list" }, STR)).toBe(false);
    expect(portTypesCompatible(INT, STR)).toBe(false);
  });

  it("compares container arguments when both sides declare them", () => {
    const listOfStr = { type: "list", type_args: [STR] };
    expect(portTypesCompatible(listOfStr, { type: "list", type_args: [STR] })).toBe(
      true
    );
    expect(portTypesCompatible(listOfStr, { type: "list", type_args: [INT] })).toBe(
      false
    );
    // A bare `list` is a widening, not a mismatch.
    expect(portTypesCompatible(listOfStr, { type: "list" })).toBe(true);
  });

  it("stays out of the way for types it cannot reason about", () => {
    expect(portTypesCompatible({ type: "ImageRef" }, { type: "ImageRef" })).toBe(
      true
    );
    expect(portTypesCompatible(STR, { type: "union" })).toBe(true);
    expect(portTypesCompatible(STR, { type: "enum" })).toBe(true);
  });
});

describe("SubmitCodeTool seeded inputs", () => {
  const seeded = [{ name: "text", type: STR }];

  it("rejects a submission that renames a connected input", async () => {
    const tool = new SubmitCodeTool({ requiredInputs: seeded });

    const result = (await tool.process(
      context,
      submission([{ name: "content", type: STR }], [{ name: "count", type: INT }])
    )) as Result;

    expect(result.status).toBe("code_rejected");
    expect(result.errors?.join(" ")).toContain('Input "text"');
    expect(tool.submission).toBeNull();
  });

  it("rejects a submission that drops a connected input", async () => {
    const tool = new SubmitCodeTool({ requiredInputs: seeded });

    const result = (await tool.process(
      context,
      submission([], [{ name: "count", type: INT }])
    )) as Result;

    expect(result.status).toBe("code_rejected");
    expect(result.errors?.join(" ")).toContain('Input "text"');
  });

  it("rejects a submission that retypes a connected input", async () => {
    const tool = new SubmitCodeTool({
      requiredInputs: [{ name: "text", type: { type: "list", type_args: [STR] } }]
    });

    const result = (await tool.process(
      context,
      submission([{ name: "text", type: STR }], [{ name: "count", type: INT }])
    )) as Result;

    expect(result.status).toBe("code_rejected");
    expect(result.errors?.join(" ")).toContain("list[str]");
  });

  it("accepts the seeded input kept under its own name and type", async () => {
    const tool = new SubmitCodeTool({ requiredInputs: seeded });

    const result = (await tool.process(
      context,
      submission([{ name: "text", type: STR }], [{ name: "count", type: INT }])
    )) as Result;

    expect(result.status).toBe("code_accepted");
    expect(tool.submission?.inputs[0]?.name).toBe("text");
  });

  it("allows inputs the model adds alongside the seeded one", async () => {
    const tool = new SubmitCodeTool({ requiredInputs: seeded });

    const result = (await tool.process(
      context,
      submission(
        [
          { name: "text", type: STR },
          { name: "separator", type: STR }
        ],
        [{ name: "count", type: INT }]
      )
    )) as Result;

    expect(result.status).toBe("code_accepted");
  });
});

describe("SubmitCodeTool expected output", () => {
  const expectedOutput = { name: "count", type: INT };

  it("rejects a submission that renames the connected output", async () => {
    const tool = new SubmitCodeTool({ expectedOutput });

    const result = (await tool.process(
      context,
      submission([{ name: "text", type: STR }], [{ name: "total", type: INT }])
    )) as Result;

    expect(result.status).toBe("code_rejected");
    expect(result.errors?.join(" ")).toContain('Output "count"');
  });

  it("rejects a submission that retypes the connected output", async () => {
    const tool = new SubmitCodeTool({ expectedOutput });

    const result = (await tool.process(
      context,
      submission([{ name: "text", type: STR }], [{ name: "count", type: STR }])
    )) as Result;

    expect(result.status).toBe("code_rejected");
    expect(result.errors?.join(" ")).toContain('Output "count"');
  });

  it("accepts the expected output declared as asked", async () => {
    const tool = new SubmitCodeTool({ expectedOutput });

    const result = (await tool.process(
      context,
      submission([{ name: "text", type: STR }], [{ name: "count", type: INT }])
    )) as Result;

    expect(result.status).toBe("code_accepted");
  });

  it("checks nothing when no handle was seeded", async () => {
    const tool = new SubmitCodeTool();

    const result = (await tool.process(
      context,
      submission([{ name: "text", type: STR }], [{ name: "count", type: INT }])
    )) as Result;

    expect(result.status).toBe("code_accepted");
  });
});
