import { describe, it, expect } from "vitest";
import {
  codeGenError,
  codeGenErrorCodes,
  codeGenRequest,
  codeGenSubmission,
  codeGenTypeMetadata,
  portName,
  MAX_CODE_LENGTH,
  MAX_INSTRUCTION_LENGTH,
  MAX_PORTS,
  MAX_SAMPLE_VALUES_BYTES
} from "../src/api-schemas/code-gen.js";

const stringType = { type: "str" };

const validSubmission = {
  title: "Join names",
  summary: "Concatenates first and last name.",
  code: "return { full: input.first + ' ' + input.last };",
  inputs: [
    { name: "first", type: stringType, required: true },
    { name: "last", type: stringType, description: "Family name" }
  ],
  outputs: [{ name: "full", type: stringType }]
};

describe("codeGenSubmission", () => {
  it("accepts a valid submission", () => {
    const result = codeGenSubmission.safeParse(validSubmission);
    expect(result.success).toBe(true);
  });

  it("rejects a port name that is not an identifier", () => {
    expect(
      codeGenSubmission.safeParse({
        ...validSubmission,
        outputs: [{ name: "full name", type: stringType }]
      }).success
    ).toBe(false);
    expect(portName.safeParse("2nd").success).toBe(false);
    expect(portName.safeParse("$_ok1").success).toBe(true);
  });

  it("rejects a reserved word as a port name", () => {
    expect(
      codeGenSubmission.safeParse({
        ...validSubmission,
        inputs: [{ name: "return", type: stringType }]
      }).success
    ).toBe(false);
    expect(portName.safeParse("await").success).toBe(false);
    expect(portName.safeParse("awaited").success).toBe(true);
  });

  it("rejects duplicate names within a direction", () => {
    const result = codeGenSubmission.safeParse({
      ...validSubmission,
      inputs: [
        { name: "first", type: stringType },
        { name: "first", type: stringType }
      ]
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("Duplicate port name");
  });

  it("allows the same name on an input and an output", () => {
    expect(
      codeGenSubmission.safeParse({
        ...validSubmission,
        inputs: [{ name: "full", type: stringType }],
        outputs: [{ name: "full", type: stringType }]
      }).success
    ).toBe(true);
  });

  it("rejects zero outputs", () => {
    expect(
      codeGenSubmission.safeParse({ ...validSubmission, outputs: [] }).success
    ).toBe(false);
  });

  it("rejects more ports than the cap", () => {
    const outputs = Array.from({ length: MAX_PORTS + 1 }, (_, i) => ({
      name: `out${i}`,
      type: stringType
    }));
    expect(
      codeGenSubmission.safeParse({ ...validSubmission, outputs }).success
    ).toBe(false);
  });

  it("rejects oversize code", () => {
    expect(
      codeGenSubmission.safeParse({
        ...validSubmission,
        code: "x".repeat(MAX_CODE_LENGTH + 1)
      }).success
    ).toBe(false);
  });

  it("round-trips nested type metadata", () => {
    const listOfStrings = {
      type: "list",
      type_args: [{ type: "dict", type_args: [{ type: "str" }] }]
    };
    const result = codeGenSubmission.safeParse({
      ...validSubmission,
      outputs: [{ name: "rows", type: listOfStrings }]
    });
    expect(result.success).toBe(true);
    expect(result.data?.outputs[0]?.type).toEqual(listOfStrings);
  });

  it("rejects type metadata without a type string", () => {
    expect(codeGenTypeMetadata.safeParse({ optional: true }).success).toBe(
      false
    );
    expect(codeGenTypeMetadata.safeParse("str").success).toBe(false);
  });
});

describe("codeGenRequest", () => {
  const baseRequest = {
    instruction: "Combine the name parts",
    provider: "anthropic",
    model: "claude-sonnet-5"
  };

  it("defaults inputs to an empty list", () => {
    const result = codeGenRequest.safeParse(baseRequest);
    expect(result.success).toBe(true);
    expect(result.data?.inputs).toEqual([]);
  });

  it("rejects an empty or oversize instruction", () => {
    expect(
      codeGenRequest.safeParse({ ...baseRequest, instruction: "   " }).success
    ).toBe(false);
    expect(
      codeGenRequest.safeParse({
        ...baseRequest,
        instruction: "x".repeat(MAX_INSTRUCTION_LENGTH + 1)
      }).success
    ).toBe(false);
  });

  it("accepts the edit-path fields", () => {
    const result = codeGenRequest.safeParse({
      ...baseRequest,
      currentCode: "return { full: 'x' };",
      currentInputs: [{ name: "first", type: stringType }],
      currentOutputs: [{ name: "full", type: stringType }],
      expectedOutput: { name: "full", type: stringType }
    });
    expect(result.success).toBe(true);
  });

  it("rejects a sample payload above the byte cap", () => {
    expect(
      codeGenRequest.safeParse({
        ...baseRequest,
        sampleValues: { first: "a" }
      }).success
    ).toBe(true);
    expect(
      codeGenRequest.safeParse({
        ...baseRequest,
        sampleValues: { first: "x".repeat(MAX_SAMPLE_VALUES_BYTES) }
      }).success
    ).toBe(false);
  });
});

describe("codeGenError", () => {
  const variants: Record<(typeof codeGenErrorCodes)[number], unknown> = {
    disabled: {
      code: "disabled",
      message: "Code generation is not enabled on this server."
    },
    provider_unavailable: {
      code: "provider_unavailable",
      message: "No API key for anthropic",
      provider: "anthropic"
    },
    aborted: { code: "aborted", message: "Cancelled by user" },
    no_valid_submission: {
      code: "no_valid_submission",
      message: "Model gave up after 3 rounds",
      issues: ["output `full` missing"],
      rounds: 3
    },
    rate_limited: {
      code: "rate_limited",
      message: "Too many generations in flight",
      retryAfterMs: 5000
    },
    internal: { code: "internal", message: "Unexpected failure" }
  };

  it.each(codeGenErrorCodes)("parses the %s variant", (code) => {
    expect(codeGenError.safeParse(variants[code]).success).toBe(true);
  });

  it("defaults no_valid_submission issues to an empty list", () => {
    const result = codeGenError.safeParse({
      code: "no_valid_submission",
      message: "none"
    });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ issues: [] });
  });

  it("rejects an unknown code", () => {
    expect(
      codeGenError.safeParse({ code: "boom", message: "x" }).success
    ).toBe(false);
  });
});
