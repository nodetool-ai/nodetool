import {
  validateIdentifierName,
  startsWithNumber,
} from "./identifierValidation";

describe("validateIdentifierName", () => {
  it("accepts a valid name", () => {
    expect(validateIdentifierName("myVar")).toEqual({ isValid: true });
  });

  it("accepts names starting with underscore", () => {
    expect(validateIdentifierName("_private")).toEqual({ isValid: true });
  });

  it("rejects empty string", () => {
    const result = validateIdentifierName("");
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });

  it("rejects whitespace-only string", () => {
    const result = validateIdentifierName("   ");
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });

  it("rejects names starting with a digit", () => {
    const result = validateIdentifierName("1abc");
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/number/i);
  });

  it("trims leading whitespace before validating", () => {
    expect(validateIdentifierName("  validName")).toEqual({ isValid: true });
  });

  it("rejects trimmed name starting with digit", () => {
    const result = validateIdentifierName("  9foo");
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/number/i);
  });
});

describe("startsWithNumber", () => {
  it("returns true for names starting with a digit", () => {
    expect(startsWithNumber("0abc")).toBe(true);
    expect(startsWithNumber("9")).toBe(true);
  });

  it("returns false for names starting with a letter", () => {
    expect(startsWithNumber("abc")).toBe(false);
  });

  it("returns false for names starting with underscore", () => {
    expect(startsWithNumber("_foo")).toBe(false);
  });

  it("trims whitespace before checking", () => {
    expect(startsWithNumber("  3bar")).toBe(true);
    expect(startsWithNumber("  bar")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(startsWithNumber("")).toBe(false);
  });
});
