import {
  summarizePropertyValue,
  formatNodeProperties,
  formatInputConnections
} from "../bugReport";

describe("summarizePropertyValue", () => {
  it("renders model values as type: provider/id", () => {
    expect(
      summarizePropertyValue({
        type: "image_model",
        provider: "fal",
        id: "fal-ai/flux/dev",
        name: "Flux Dev"
      })
    ).toBe("image_model: fal/fal-ai/flux/dev");
  });

  it("falls back to the model name when id is missing", () => {
    expect(
      summarizePropertyValue({
        type: "language_model",
        provider: "openai",
        name: "gpt-5.4"
      })
    ).toBe("language_model: openai/gpt-5.4");
  });

  it("collapses asset refs to their type and id, never the bytes", () => {
    expect(
      summarizePropertyValue({ type: "image", asset_id: "abc123" })
    ).toBe("<image asset abc123>");
  });

  it("never inlines base64 data URIs from asset refs", () => {
    const out = summarizePropertyValue({
      type: "image",
      uri: "data:image/png;base64,AAAA"
    });
    expect(out).toBe("<image (inline data)>");
    expect(out).not.toContain("AAAA");
  });

  it("shows non-data asset uris truncated", () => {
    expect(
      summarizePropertyValue({ type: "audio", uri: "https://example.com/a.mp3" })
    ).toBe("<audio https://example.com/a.mp3>");
  });

  it("collapses inline data URI strings", () => {
    const out = summarizePropertyValue(
      "data:image/png;base64," + "A".repeat(500)
    );
    expect(out).toContain("inline image/png data");
    expect(out).not.toContain("AAAA");
  });

  it("passes through scalars", () => {
    expect(summarizePropertyValue(42)).toBe("42");
    expect(summarizePropertyValue(true)).toBe("true");
    expect(summarizePropertyValue("hello")).toBe("hello");
    expect(summarizePropertyValue(null)).toBe("null");
    expect(summarizePropertyValue(undefined)).toBe("null");
  });

  it("truncates long strings and notes the length", () => {
    const out = summarizePropertyValue("x".repeat(500));
    expect(out).toContain("… (500 chars)");
    expect(out.length).toBeLessThan(500);
  });

  it("summarizes arrays with their length", () => {
    expect(summarizePropertyValue([1, 2, 3])).toContain("array(3)");
  });
});

describe("formatNodeProperties", () => {
  it("redacts secret-bearing keys by name", () => {
    const out = formatNodeProperties({
      api_key: "sk-supersecret",
      token: "abc",
      auth_header: "Bearer xyz",
      model: "flux"
    });
    expect(out).toContain("api_key: «redacted»");
    expect(out).toContain("token: «redacted»");
    expect(out).toContain("auth_header: «redacted»");
    expect(out).not.toContain("sk-supersecret");
    expect(out).not.toContain("Bearer xyz");
    expect(out).toContain("model: flux");
  });

  it("handles empty properties", () => {
    expect(formatNodeProperties({})).toBe("(no properties set)");
    expect(formatNodeProperties(undefined)).toBe("(no properties set)");
    expect(formatNodeProperties(null)).toBe("(no properties set)");
  });
});

describe("formatInputConnections", () => {
  it("lists upstream connections with handles", () => {
    const out = formatInputConnections([
      {
        sourceType: "nodetool.constant.Image",
        sourceHandle: "output",
        targetHandle: "image"
      },
      {
        sourceType: "nodetool.text.Template",
        sourceTitle: "Prompt",
        targetHandle: "prompt"
      }
    ]);
    expect(out).toContain("nodetool.constant.Image.output → image");
    expect(out).toContain('nodetool.text.Template ("Prompt") → prompt');
  });

  it("handles no connections", () => {
    expect(formatInputConnections([])).toBe("(no connected inputs)");
  });
});
