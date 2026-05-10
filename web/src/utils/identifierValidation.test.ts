import {
  validateIdentifierName
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

