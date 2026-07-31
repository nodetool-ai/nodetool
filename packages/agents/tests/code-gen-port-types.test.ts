/**
 * Port-type aliasing. A generated type lands verbatim on the node and decides
 * handle compatibility, so a JSON-Schema spelling produces a node that looks
 * right and silently refuses to connect.
 */
import { describe, it, expect } from "vitest";
import {
  canonicalPortType,
  checkPortTypes,
  CORE_PORT_TYPES
} from "../src/code-gen/port-types.js";
import { SubmitCodeTool } from "../src/tools/submit-code-tool.js";

const port = (name: string, type: unknown) => ({ name, type });

describe("canonicalPortType", () => {
  it("maps JSON Schema and TypeScript spellings onto NodeTool names", () => {
    expect(canonicalPortType("integer")).toBe("int");
    expect(canonicalPortType("string")).toBe("str");
    expect(canonicalPortType("boolean")).toBe("bool");
    expect(canonicalPortType("object")).toBe("dict");
    expect(canonicalPortType("array")).toBe("list");
    expect(canonicalPortType("Integer")).toBe("int");
  });

  it("leaves NodeTool's own names alone", () => {
    for (const type of CORE_PORT_TYPES) {
      expect(canonicalPortType(type)).toBeUndefined();
    }
  });

  it("does not claim unknown node types are aliases", () => {
    expect(canonicalPortType("ImageRef")).toBeUndefined();
    expect(canonicalPortType("my.custom.Type")).toBeUndefined();
  });
});

describe("checkPortTypes", () => {
  it("accepts a submission typed with NodeTool names", () => {
    expect(
      checkPortTypes({
        inputs: [port("rows", { type: "list" })],
        outputs: [port("total", { type: "int" })]
      })
    ).toEqual([]);
  });

  it("names the replacement for an aliased output", () => {
    const errors = checkPortTypes({
      inputs: [],
      outputs: [port("count", { type: "integer" })]
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('output "count"');
    expect(errors[0]).toContain('use "int"');
  });

  it("walks type_args so list[integer] is caught", () => {
    const errors = checkPortTypes({
      inputs: [],
      outputs: [
        port("counts", { type: "list", type_args: [{ type: "integer" }] })
      ]
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('use "int"');
  });

  it("passes custom node types through", () => {
    expect(
      checkPortTypes({
        inputs: [port("img", { type: "ImageRef" })],
        outputs: [port("out", { type: "my.custom.Type" })]
      })
    ).toEqual([]);
  });
});

describe("SubmitCodeTool port types", () => {
  const context = {} as never;

  const submission = (outputType: unknown) => ({
    title: "Count the words",
    summary: "Counts whitespace-separated words in the text.",
    code: `const words = text.split(" ");\nreturn { count: words.length };`,
    inputs: [{ name: "text", type: { type: "str" } }],
    outputs: [{ name: "count", type: outputType }]
  });

  it("rejects an aliased type instead of writing it to the node", async () => {
    const tool = new SubmitCodeTool();
    const result = (await tool.process(
      context,
      submission({ type: "integer" })
    )) as { status: string; errors: string[] };

    expect(result.status).toBe("code_rejected");
    expect(result.errors.join(" ")).toContain('use "int"');
    expect(tool.submission).toBeNull();
  });

  it("accepts the same submission once the type is corrected", async () => {
    const tool = new SubmitCodeTool();
    const result = (await tool.process(context, submission({ type: "int" }))) as {
      status: string;
    };

    expect(result.status).toBe("code_accepted");
    expect(tool.submission?.outputs[0]?.name).toBe("count");
  });
});
