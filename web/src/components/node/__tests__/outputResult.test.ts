import { getOutputFromResult, getCopySource } from "../outputResult";

describe("getOutputFromResult", () => {
  it("returns null for null and undefined", () => {
    expect(getOutputFromResult(null)).toBeNull();
    expect(getOutputFromResult(undefined)).toBeNull();
  });

  it("returns a bare string as-is", () => {
    expect(getOutputFromResult("hello")).toBe("hello");
  });

  it("returns a bare number as-is", () => {
    expect(getOutputFromResult(42)).toBe(42);
  });

  it("unwraps { output } wrapper", () => {
    expect(getOutputFromResult({ output: "inner" })).toBe("inner");
  });

  it("preserves object without output key", () => {
    const obj = { foo: "bar" };
    expect(getOutputFromResult(obj)).toBe(obj);
  });

  it("unwraps array of { output } items", () => {
    const result = getOutputFromResult([
      { output: "a" },
      { output: "b" }
    ]);
    expect(result).toBe("a\nb");
  });

  it("joins all-string arrays with newlines", () => {
    expect(getOutputFromResult(["line1", "line2"])).toBe("line1\nline2");
  });

  it("returns mixed-type arrays without joining", () => {
    const result = getOutputFromResult(["text", 42]);
    expect(result).toEqual(["text", 42]);
  });

  it("passes through array items without output key", () => {
    const result = getOutputFromResult([{ data: 1 }, { data: 2 }]);
    expect(result).toEqual([{ data: 1 }, { data: 2 }]);
  });

  it("handles empty array", () => {
    expect(getOutputFromResult([])).toBe("");
  });

  it("does not unwrap { output: undefined }", () => {
    const obj = { output: undefined };
    expect(getOutputFromResult(obj)).toBe(obj);
  });
});

describe("getCopySource", () => {
  it("returns null and undefined unchanged", () => {
    expect(getCopySource(null)).toBeNull();
    expect(getCopySource(undefined)).toBeUndefined();
  });

  it("returns a string as-is", () => {
    expect(getCopySource("hello")).toBe("hello");
  });

  it("extracts .data from text-typed objects", () => {
    expect(getCopySource({ type: "text", data: "payload" })).toBe("payload");
  });

  it("recurses through { output } wrapper", () => {
    expect(getCopySource({ output: "inner" })).toBe("inner");
  });

  it("recurses through { value } wrapper", () => {
    expect(getCopySource({ value: "inner" })).toBe("inner");
  });

  it("recurses through nested wrappers", () => {
    expect(
      getCopySource({ output: { value: { type: "text", data: "deep" } } })
    ).toBe("deep");
  });

  it("joins all-string arrays with newlines", () => {
    expect(getCopySource(["a", "b"])).toBe("a\nb");
  });

  it("maps array items through getCopySource recursively", () => {
    const result = getCopySource([
      { type: "text", data: "first" },
      { type: "text", data: "second" }
    ]);
    expect(result).toBe("first\nsecond");
  });

  it("returns mixed-type arrays without joining", () => {
    const result = getCopySource(["text", { complex: true }]);
    expect(result).toEqual(["text", { complex: true }]);
  });

  it("returns objects without known wrapper keys as-is", () => {
    const obj = { foo: "bar" };
    expect(getCopySource(obj)).toBe(obj);
  });
});
