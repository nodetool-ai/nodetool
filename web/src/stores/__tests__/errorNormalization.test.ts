import { normalizeNodeError, hasNodeError, nodeErrorToDisplayString } from "../ErrorStore";

describe("normalizeNodeError", () => {
  it("returns undefined for null", () => {
    expect(normalizeNodeError(null)).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(normalizeNodeError(undefined)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(normalizeNodeError("")).toBeUndefined();
  });

  it("returns undefined for whitespace-only string", () => {
    expect(normalizeNodeError("  ")).toBeUndefined();
  });

  it("returns undefined for 'null'", () => {
    expect(normalizeNodeError("null")).toBeUndefined();
  });

  it("returns undefined for 'NULL'", () => {
    expect(normalizeNodeError("NULL")).toBeUndefined();
  });

  it("returns undefined for 'undefined'", () => {
    expect(normalizeNodeError("undefined")).toBeUndefined();
  });

  it("returns undefined for 'UNDEFINED'", () => {
    expect(normalizeNodeError("UNDEFINED")).toBeUndefined();
  });

  it("returns trimmed string for non-empty string", () => {
    expect(normalizeNodeError("hello")).toBe("hello");
  });

  it("trims whitespace from strings", () => {
    expect(normalizeNodeError("  hello  ")).toBe("hello");
  });

  it("returns Error object when message is non-empty", () => {
    const err = new Error("fail");
    expect(normalizeNodeError(err)).toBe(err);
  });

  it("returns undefined for Error with empty message", () => {
    expect(normalizeNodeError(new Error(""))).toBeUndefined();
  });

  it("returns undefined for Error with whitespace-only message", () => {
    expect(normalizeNodeError(new Error("  "))).toBeUndefined();
  });

  it("returns object as-is", () => {
    const obj = { foo: "bar" };
    expect(normalizeNodeError(obj)).toBe(obj);
  });

  it("returns object for 0 passed as unknown", () => {
    expect(normalizeNodeError(0 as unknown as null)).toBe(0);
  });

  it("returns object for false passed as unknown", () => {
    expect(normalizeNodeError(false as unknown as null)).toBe(false);
  });
});

describe("hasNodeError", () => {
  it("returns false for null", () => {
    expect(hasNodeError(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(hasNodeError(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(hasNodeError("")).toBe(false);
  });

  it("returns false for 'null'", () => {
    expect(hasNodeError("null")).toBe(false);
  });

  it("returns true for non-empty string", () => {
    expect(hasNodeError("error text")).toBe(true);
  });

  it("returns true for Error with message", () => {
    expect(hasNodeError(new Error("fail"))).toBe(true);
  });

  it("returns false for Error with empty message", () => {
    expect(hasNodeError(new Error(""))).toBe(false);
  });

  it("returns true for object with message", () => {
    expect(hasNodeError({ message: "oops" })).toBe(true);
  });
});

describe("nodeErrorToDisplayString", () => {
  it("returns empty string for null", () => {
    expect(nodeErrorToDisplayString(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(nodeErrorToDisplayString(undefined)).toBe("");
  });

  it("returns the string for non-empty string", () => {
    expect(nodeErrorToDisplayString("error msg")).toBe("error msg");
  });

  it("returns error.message for Error", () => {
    expect(nodeErrorToDisplayString(new Error("fail"))).toBe("fail");
  });

  it("returns message property for object with message", () => {
    expect(nodeErrorToDisplayString({ message: "oops" })).toBe("oops");
  });

  it("returns JSON.stringify for object without message", () => {
    const obj = { foo: "bar" };
    expect(nodeErrorToDisplayString(obj)).toBe(JSON.stringify(obj));
  });
});
