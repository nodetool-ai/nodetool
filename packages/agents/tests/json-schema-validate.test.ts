import { describe, it, expect } from "vitest";
import {
  validateAgainstSchema,
  formatViolations
} from "../src/utils/json-schema-validate.js";

describe("validateAgainstSchema", () => {
  it("accepts a value matching the schema", () => {
    const schema = {
      type: "object",
      properties: { answer: { type: "string" } },
      required: ["answer"]
    };
    expect(validateAgainstSchema({ answer: "42" }, schema)).toEqual([]);
  });

  it("rejects a value outside an enum", () => {
    const schema = { type: "string", enum: ["skip", "fail"] };
    const violations = validateAgainstSchema("retry", schema);
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain("must be one of");
  });

  it("validates nested properties, not just the top level", () => {
    const schema = {
      type: "object",
      properties: {
        outputs: {
          type: "object",
          properties: { count: { type: "integer" } },
          required: ["count"]
        }
      }
    };
    const violations = validateAgainstSchema(
      { outputs: { count: "seven" } },
      schema
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].path).toBe("result.outputs.count");
  });

  it("rejects unexpected keys when additionalProperties is false", () => {
    const schema = {
      type: "object",
      properties: { a: { type: "string" } },
      additionalProperties: false
    };
    const violations = validateAgainstSchema({ a: "x", b: 1 }, schema);
    expect(formatViolations(violations)).toContain('unexpected property "b"');
  });

  it("required uses own properties, not the prototype chain", () => {
    const schema = { type: "object", required: ["toString"] };
    expect(validateAgainstSchema({}, schema)).toHaveLength(1);
  });

  it("picks the matching branch of a discriminated union", () => {
    const schema = {
      type: "object",
      oneOf: [
        {
          type: "object",
          properties: { action: { const: "skip" } },
          required: ["action"],
          additionalProperties: false
        },
        {
          type: "object",
          properties: {
            action: { const: "substitute" },
            outputs: { type: "object" }
          },
          required: ["action", "outputs"],
          additionalProperties: false
        }
      ]
    };
    expect(validateAgainstSchema({ action: "skip" }, schema)).toEqual([]);
    expect(
      validateAgainstSchema({ action: "substitute", outputs: {} }, schema)
    ).toEqual([]);
    // The right shape for the wrong branch is still wrong.
    expect(
      validateAgainstSchema({ action: "substitute" }, schema).length
    ).toBeGreaterThan(0);
    expect(validateAgainstSchema({ action: "retry" }, schema).length).toBe(1);
  });

  it("reports the closest branch when every union branch fails", () => {
    const schema = {
      oneOf: [
        {
          type: "object",
          properties: { a: { type: "string" }, b: { type: "string" } },
          required: ["a", "b"]
        },
        { type: "object", properties: { z: { type: "string" } }, required: ["z"] }
      ]
    };
    // One missing key beats two — the model hears about the branch it nearly hit.
    const violations = validateAgainstSchema({ a: "x" }, schema);
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain('"b"');
  });

  it("checks array items and bounds", () => {
    const schema = {
      type: "array",
      items: { type: "number" },
      minItems: 2
    };
    expect(validateAgainstSchema([1, 2], schema)).toEqual([]);
    expect(validateAgainstSchema([1], schema)).toHaveLength(1);
    expect(validateAgainstSchema([1, "two"], schema)[0].path).toBe("result[1]");
  });

  it("accepts an integer where a number is declared, but not the reverse", () => {
    expect(validateAgainstSchema(3, { type: "number" })).toEqual([]);
    expect(validateAgainstSchema(3, { type: "integer" })).toEqual([]);
    expect(validateAgainstSchema(3.5, { type: "integer" })).toHaveLength(1);
  });
});
