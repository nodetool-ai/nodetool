import { describe, it, expect } from "vitest";
import { usesStreamInputContract } from "../src/code-body.js";
import { parseCodeBody, streamCallNames } from "../src/code-analysis.js";
import {
  validateCodeNodeBody,
  type CodeNodeValidationInput
} from "../src/code-node-validation.js";

const codes = (input: CodeNodeValidationInput): string[] =>
  validateCodeNodeBody(input).map((issue) => issue.code);

const messageFor = (input: CodeNodeValidationInput, code: string): string => {
  const issue = validateCodeNodeBody(input).find((i) => i.code === code);
  if (!issue) throw new Error(`no ${code} issue in ${JSON.stringify(codes(input))}`);
  return issue.message;
};

describe("usesStreamInputContract", () => {
  it.each([
    ['for await (const x of stream("a")) { emit("o", x); }', "a free call"],
    ['const v = await stream.first("a");', "stream.first"],
    ['if (stream.open("a")) { emit("o", 1); }', "stream.open"],
    ['for await (const [h, v] of stream.any()) { emit("o", v); }', "stream.any"],
    ['const s = stream("a");', "assigned"],
    ['stream ("a");', "space before the paren"]
  ])("is true for %s (%s)", (code) => {
    expect(usesStreamInputContract(code)).toBe(true);
  });

  it.each([
    ["const r = {}; r.stream(1);", "a method named stream"],
    ["const r = {}; r.stream.first(1);", "a member named stream"],
    ["mystream(1);", "a name ending in stream"],
    ["const x = $stream(1);", "a name ending in stream after $"],
    ["const stream_a = 1; emit('o', stream_a);", "a name starting with stream"],
    ["const p = { s: stream };", "a bare read that is neither a call nor a member"],
    ['const s = "call stream(name) here";', "inside a string literal"],
    ['// stream("a")\nreturn { a: 1 };', "inside a line comment"],
    ['/* stream.any() */\nreturn { a: 1 };', "inside a block comment"],
    ["return { total: inputs.a + inputs.b };", "no mention at all"]
  ])("is false for %s (%s)", (code) => {
    expect(usesStreamInputContract(code)).toBe(false);
  });
});

describe("streamCallNames", () => {
  const names = (code: string) => {
    const parsed = parseCodeBody(code);
    if ("error" in parsed) throw new Error(parsed.error);
    return streamCallNames(parsed.statements);
  };

  it("collects literal names from stream(), stream.first() and stream.open()", () => {
    expect(
      names(
        'for await (const x of stream("a")) {}\n' +
          'await stream.first("b");\n' +
          'stream.open("c");'
      )
    ).toEqual({ names: ["a", "b", "c"], nonLiteral: false, usesAny: false });
  });

  it("flags a non-literal first argument without inventing a name", () => {
    expect(names("const k = 'a'; stream(k);")).toEqual({
      names: [],
      nonLiteral: true,
      usesAny: false
    });
  });

  it("reports stream.any() separately and takes no name from it", () => {
    expect(names("for await (const [h, v] of stream.any()) {}")).toEqual({
      names: [],
      nonLiteral: false,
      usesAny: true
    });
  });

  it("ignores stream-named methods on other objects", () => {
    expect(names('const r = { stream(n) {} }; r.stream("a");').names).toEqual([]);
  });

  it("reports nothing when the body binds `stream` itself", () => {
    expect(
      names('const stream = (n) => []; for (const x of stream("a")) {}')
    ).toEqual({ names: [], nonLiteral: false, usesAny: false });
  });
});

// ── Rule a: a stream naming a handle the node does not declare ──────────────
describe("undeclared stream name", () => {
  const body = (handle: string): CodeNodeValidationInput => ({
    code: `for await (const x of stream("${handle}")) { await emit("out", x); }`,
    availableInputs: ["numbers"],
    connectedInputs: ["numbers"],
    declaredOutputs: ["out"]
  });

  it("is an error when the handle is not an input", () => {
    expect(codes(body("nubmers"))).toContain("code_undefined_stream");
    expect(messageFor(body("nubmers"), "code_undefined_stream")).toBe(
      'The code takes from "nubmers", which is not an input of this node — the ' +
        "stream never yields. Declare it as a dynamic input, or fix the name."
    );
  });

  it("is silent on the same body with the handle spelled right", () => {
    expect(codes(body("numbers"))).not.toContain("code_undefined_stream");
  });
});

// ── Rule b: a stream name the reader cannot see ─────────────────────────────
describe("non-literal stream name", () => {
  const base = {
    availableInputs: ["numbers"],
    connectedInputs: ["numbers"],
    declaredOutputs: ["out"]
  };

  it("warns that the names cannot be checked", () => {
    const input = {
      ...base,
      code: 'const h = "numbers";\nfor await (const x of stream(h)) { await emit("out", x); }'
    };
    expect(codes(input)).toContain("code_stream_dynamic_name");
    expect(
      validateCodeNodeBody(input).find(
        (i) => i.code === "code_stream_dynamic_name"
      )?.severity
    ).toBe("warning");
    expect(messageFor(input, "code_stream_dynamic_name")).toBe(
      "The code calls `stream` with a handle name that is not a string literal, " +
        "so the stream names cannot be checked statically. Pass a literal name to " +
        "have them checked."
    );
  });

  it("is silent when the same name is passed as a literal", () => {
    expect(
      codes({
        ...base,
        code: 'for await (const x of stream("numbers")) { await emit("out", x); }'
      })
    ).not.toContain("code_stream_dynamic_name");
  });
});

// ── Rule c: a declared but unconnected handle ───────────────────────────────
describe("unconnected stream handle", () => {
  const body = (connected: string[]): CodeNodeValidationInput => ({
    code: 'for await (const x of stream("numbers")) { await emit("out", x); }',
    availableInputs: ["numbers"],
    connectedInputs: connected,
    declaredOutputs: ["out"]
  });

  it("warns when no edge feeds the handle", () => {
    expect(codes(body([]))).toContain("code_unconnected_stream");
    expect(messageFor(body([]), "code_unconnected_stream")).toBe(
      'The code takes from "numbers", which no incoming edge feeds — the stream ' +
        "completes immediately and yields nothing. Connect an upstream node, or " +
        "read the node's configured value with `inputs.numbers`."
    );
  });

  it("is silent once an edge feeds it", () => {
    expect(codes(body(["numbers"]))).not.toContain("code_unconnected_stream");
  });
});

// ── Rule d: reading a connected handle through `inputs` ─────────────────────
describe("inputs read of a connected handle in a streaming body", () => {
  const body = (connected: string[]): CodeNodeValidationInput => ({
    code:
      'for await (const x of stream("numbers")) {\n' +
      '  await emit("out", x * inputs.factor);\n' +
      "}",
    availableInputs: ["numbers", "factor"],
    connectedInputs: connected,
    declaredOutputs: ["out"]
  });

  it("is an error when an edge feeds the handle read through inputs", () => {
    expect(codes(body(["numbers", "factor"]))).toContain(
      "code_stream_input_read"
    );
    expect(
      messageFor(body(["numbers", "factor"]), "code_stream_input_read")
    ).toBe(
      "The code reads `inputs.factor`, which an incoming edge feeds — in a " +
        "streaming body `inputs` carries only the node's configured values, never " +
        'edge data. Use `stream("factor")`.'
    );
  });

  it("is silent when the handle is configured rather than wired", () => {
    expect(codes(body(["numbers"]))).not.toContain("code_stream_input_read");
  });

  it("does not apply to a buffered body reading the same connected handle", () => {
    expect(
      codes({
        code: "return { out: inputs.numbers * inputs.factor };",
        availableInputs: ["numbers", "factor"],
        connectedInputs: ["numbers", "factor"],
        declaredOutputs: ["out"]
      })
    ).not.toContain("code_stream_input_read");
  });
});

// ── Rule e: a streaming body on the legacy return contract ──────────────────
describe("streaming body outputs", () => {
  const base = {
    availableInputs: ["numbers"],
    connectedInputs: ["numbers"],
    declaredOutputs: ["total"]
  };

  it("is an error when the body returns its outputs instead of emitting", () => {
    const input = {
      ...base,
      code:
        "let sum = 0;\n" +
        'for await (const n of stream("numbers")) { sum += n; }\n' +
        "return { total: sum };"
    };
    expect(codes(input)).toContain("code_stream_return_contract");
    expect(messageFor(input, "code_stream_return_contract")).toBe(
      "The code calls `stream`, so it runs once and its return value is control " +
        "flow, not outputs. Send every output through `output(name, value)` for a " +
        "final value, or `emit(name, value)` to stream values as they are produced."
    );
  });

  it("is silent once the same body sends through `output`", () => {
    expect(
      codes({
        ...base,
        code:
          "let sum = 0;\n" +
          'for await (const n of stream("numbers")) { sum += n; }\n' +
          'await output("total", sum);'
      })
    ).not.toContain("code_stream_return_contract");
  });

  it("leaves the legacy return contract intact for a buffered body", () => {
    expect(
      codes({
        ...base,
        code: "return { total: inputs.numbers };"
      })
    ).toEqual([]);
  });
});

// ── Rule f: buffered bodies validate exactly as today ───────────────────────
describe("streaming does not disturb the buffered checks", () => {
  it("treats `stream` as a sandbox global, not an invented name", () => {
    expect(
      codes({
        code: 'for await (const x of stream("a")) { await emit("o", x); }',
        availableInputs: ["a"],
        connectedInputs: ["a"],
        declaredOutputs: ["o"]
      })
    ).toEqual([]);
  });

  it("counts a streamed handle as read, so it is not reported unused", () => {
    expect(
      codes({
        code: 'for await (const x of stream("a")) { await emit("o", x); }',
        availableInputs: ["a"],
        connectedInputs: ["a"],
        declaredOutputs: ["o"]
      })
    ).not.toContain("code_unused_input");
  });

  it("counts every connected handle as read when the body uses stream.any()", () => {
    expect(
      codes({
        code: 'for await (const [h, v] of stream.any()) { await emit("o", v); }',
        availableInputs: ["a", "b"],
        connectedInputs: ["a", "b"],
        declaredOutputs: ["o"]
      })
    ).toEqual([]);
  });

  it("still reports a handle the streaming body never touches", () => {
    expect(
      codes({
        code: 'for await (const x of stream("a")) { await emit("o", x); }',
        availableInputs: ["a", "unused"],
        connectedInputs: ["a"],
        declaredOutputs: ["o"]
      })
    ).toContain("code_unused_input");
  });
});
