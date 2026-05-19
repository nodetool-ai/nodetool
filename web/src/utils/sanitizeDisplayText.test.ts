import { sanitizeDisplayText } from "./sanitizeDisplayText";

describe("sanitizeDisplayText", () => {
  it("returns short text unchanged", () => {
    expect(sanitizeDisplayText("hello world")).toBe("hello world");
  });

  it("replaces base64 data URIs with a summary", () => {
    const input = "prefix data:image/png;base64,AAAA== suffix";
    const result = sanitizeDisplayText(input);
    expect(result).toContain("[image/png base64 omitted,");
    expect(result).toContain("chars]");
    expect(result).not.toContain("AAAA==");
    expect(result).toContain("prefix");
    expect(result).toContain("suffix");
  });

  it("handles data URIs without an explicit MIME type", () => {
    const input = "data:;base64,AAAA==";
    const result = sanitizeDisplayText(input);
    expect(result).toContain("[data base64 omitted,");
  });

  it("replaces multiple data URIs", () => {
    const input =
      "img1: data:image/jpeg;base64,ABCD== img2: data:text/plain;base64,EFGH==";
    const result = sanitizeDisplayText(input);
    expect(result).toContain("[image/jpeg base64 omitted,");
    expect(result).toContain("[text/plain base64 omitted,");
  });

  it("truncates text exceeding the default max length", () => {
    const longText = "x".repeat(3000);
    const result = sanitizeDisplayText(longText);
    expect(result.length).toBeLessThan(longText.length);
    expect(result).toContain("... (truncated 1000 chars)");
  });

  it("truncates at a custom max length", () => {
    const text = "abcdefghij";
    const result = sanitizeDisplayText(text, 5);
    expect(result).toBe("abcde... (truncated 5 chars)");
  });

  it("does not truncate text at exactly the max length", () => {
    const text = "abcde";
    expect(sanitizeDisplayText(text, 5)).toBe("abcde");
  });

  it("handles empty string", () => {
    expect(sanitizeDisplayText("")).toBe("");
  });
});
