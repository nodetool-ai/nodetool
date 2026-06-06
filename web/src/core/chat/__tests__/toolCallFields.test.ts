import { visibleToolArgs } from "../toolCallFields";

describe("visibleToolArgs", () => {
  it("returns null for null input", () => {
    expect(visibleToolArgs(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(visibleToolArgs(undefined)).toBeNull();
  });

  it("returns same reference when no reserved fields present", () => {
    const args = { foo: "bar", count: 42 };
    const result = visibleToolArgs(args);
    expect(result).toBe(args);
  });

  it("strips _message field", () => {
    const args = { foo: "bar", _message: "status text" };
    const result = visibleToolArgs(args);
    expect(result).toEqual({ foo: "bar" });
    expect(result).not.toHaveProperty("_message");
  });

  it("strips _tool_call_id field", () => {
    const args = { foo: "bar", _tool_call_id: "tc-123" };
    const result = visibleToolArgs(args);
    expect(result).toEqual({ foo: "bar" });
    expect(result).not.toHaveProperty("_tool_call_id");
  });

  it("strips both reserved fields at once", () => {
    const args = { x: 1, _message: "hi", _tool_call_id: "tc-1" };
    const result = visibleToolArgs(args);
    expect(result).toEqual({ x: 1 });
  });

  it("does not mutate the original object", () => {
    const args = { foo: "bar", _message: "status" };
    visibleToolArgs(args);
    expect(args).toHaveProperty("_message");
  });

  it("returns empty object when only reserved fields present", () => {
    const args = { _message: "hi", _tool_call_id: "tc-1" };
    const result = visibleToolArgs(args);
    expect(result).toEqual({});
  });

  it("preserves non-reserved underscore-prefixed fields", () => {
    const args = { _custom: "keep", _message: "strip" };
    const result = visibleToolArgs(args);
    expect(result).toEqual({ _custom: "keep" });
  });
});
