/**
 * Coverage tests for zod-schema: isZodSchema, zodToJsonSchema, and
 * parseWithTypeCoercion (string->boolean/number coercion at nested paths).
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  isZodSchema,
  zodToJsonSchema,
  parseWithTypeCoercion
} from "../src/zod-schema.js";

describe("isZodSchema", () => {
  it("returns true for a zod schema object", () => {
    expect(isZodSchema(z.string())).toBe(true);
    expect(isZodSchema(z.object({ a: z.number() }))).toBe(true);
  });

  it("returns false for non-zod values", () => {
    expect(isZodSchema(null)).toBe(false);
    expect(isZodSchema(undefined)).toBe(false);
    expect(isZodSchema("string")).toBe(false);
    expect(isZodSchema(42)).toBe(false);
    expect(isZodSchema({})).toBe(false);
    expect(isZodSchema({ foo: "bar" })).toBe(false);
  });
});

describe("zodToJsonSchema", () => {
  it("converts a simple object schema and strips $schema dialect", () => {
    const json = zodToJsonSchema(
      z.object({ name: z.string(), age: z.number() })
    );
    expect(json.$schema).toBeUndefined();
    expect(json.type).toBe("object");
    expect((json.properties as Record<string, unknown>).name).toBeDefined();
    expect((json.properties as Record<string, unknown>).age).toBeDefined();
  });

  it("converts primitive schemas", () => {
    expect(zodToJsonSchema(z.string()).type).toBe("string");
    expect(zodToJsonSchema(z.boolean()).type).toBe("boolean");
  });

  it("handles nested object/array schemas", () => {
    const json = zodToJsonSchema(
      z.object({ items: z.array(z.object({ flag: z.boolean() })) })
    );
    expect(json.type).toBe("object");
    const items = (json.properties as Record<string, unknown>)
      .items as Record<string, unknown>;
    expect(items.type).toBe("array");
  });
});

describe("parseWithTypeCoercion", () => {
  it("passes through valid input unchanged (success path)", () => {
    const schema = z.object({ a: z.string(), b: z.number() });
    const result = parseWithTypeCoercion(schema, { a: "hi", b: 5 });
    expect(result).toEqual({ a: "hi", b: 5 });
  });

  it("applies schema defaults on success", () => {
    const schema = z.object({ a: z.string().default("x") });
    const result = parseWithTypeCoercion(schema, {});
    expect(result).toEqual({ a: "x" });
  });

  it("coerces string 'true'/'false' to boolean", () => {
    const schema = z.object({ enabled: z.boolean() });
    expect(parseWithTypeCoercion(schema, { enabled: "true" })).toEqual({
      enabled: true
    });
    expect(parseWithTypeCoercion(schema, { enabled: "false" })).toEqual({
      enabled: false
    });
  });

  it("coerces boolean strings case-insensitively and trims whitespace", () => {
    const schema = z.object({ enabled: z.boolean() });
    expect(parseWithTypeCoercion(schema, { enabled: "  TRUE  " })).toEqual({
      enabled: true
    });
  });

  it("coerces numeric strings to number", () => {
    const schema = z.object({ count: z.number() });
    expect(parseWithTypeCoercion(schema, { count: "42" })).toEqual({
      count: 42
    });
    expect(parseWithTypeCoercion(schema, { count: "-3.5" })).toEqual({
      count: -3.5
    });
  });

  it("coerces values at nested object paths", () => {
    const schema = z.object({
      config: z.object({ retries: z.number(), active: z.boolean() })
    });
    const result = parseWithTypeCoercion(schema, {
      config: { retries: "7", active: "false" }
    });
    expect(result).toEqual({ config: { retries: 7, active: false } });
  });

  it("coerces values inside arrays", () => {
    const schema = z.object({ nums: z.array(z.number()) });
    const result = parseWithTypeCoercion(schema, { nums: ["1", "2", "3"] });
    expect(result).toEqual({ nums: [1, 2, 3] });
  });

  it("coerces deeply nested object+array paths", () => {
    const schema = z.object({
      rows: z.array(z.object({ n: z.number(), flag: z.boolean() }))
    });
    const result = parseWithTypeCoercion(schema, {
      rows: [
        { n: "10", flag: "true" },
        { n: "20", flag: "false" }
      ]
    });
    expect(result).toEqual({
      rows: [
        { n: 10, flag: true },
        { n: 20, flag: false }
      ]
    });
  });

  it("throws the original ZodError when a boolean string is non-coercible", () => {
    const schema = z.object({ enabled: z.boolean() });
    expect(() => parseWithTypeCoercion(schema, { enabled: "maybe" })).toThrow(
      z.ZodError
    );
  });

  it("throws the original ZodError for a non-numeric string", () => {
    const schema = z.object({ count: z.number() });
    expect(() => parseWithTypeCoercion(schema, { count: "abc" })).toThrow(
      z.ZodError
    );
  });

  it("throws the original ZodError for an empty numeric string", () => {
    const schema = z.object({ count: z.number() });
    expect(() => parseWithTypeCoercion(schema, { count: "   " })).toThrow(
      z.ZodError
    );
  });

  it("throws when the failing issue is not a coercible type (e.g. missing required string)", () => {
    const schema = z.object({ a: z.string() });
    expect(() => parseWithTypeCoercion(schema, {})).toThrow(z.ZodError);
  });

  it("throws when a number value is not a string and cannot be coerced", () => {
    const schema = z.object({ count: z.number() });
    // an object is invalid_type number but not a string -> no change -> throw
    expect(() =>
      parseWithTypeCoercion(schema, { count: { nested: true } })
    ).toThrow(z.ZodError);
  });

  it("coerces only the coercible fields and still fails if another field is irreparable", () => {
    const schema = z.object({ n: z.number(), s: z.string() });
    // n coercible, s missing -> re-parse still fails -> throws
    expect(() => parseWithTypeCoercion(schema, { n: "5" })).toThrow(z.ZodError);
  });

  it("handles Infinity numeric string as non-finite -> non-coercible", () => {
    const schema = z.object({ count: z.number() });
    // Number("Infinity") is Infinity, not finite -> returns original -> throw
    expect(() =>
      parseWithTypeCoercion(schema, { count: "Infinity" })
    ).toThrow(z.ZodError);
  });
});
