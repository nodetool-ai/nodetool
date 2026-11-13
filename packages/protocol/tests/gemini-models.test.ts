import { describe, expect, it } from "vitest";
import { geminiModelCapabilities } from "../src/gemini-models.js";

describe("geminiModelCapabilities", () => {
  it("gives Gemini 4 Hydrogen four levels with high as the default", () => {
    expect(geminiModelCapabilities("gemini-4-hydrogen")).toEqual({
      thinking: {
        kind: "level",
        levels: ["low", "medium", "high", "xhigh"],
        defaultLevel: "high"
      },
      combinesBuiltInAndFunctionTools: true
    });
    expect(
      geminiModelCapabilities("models/gemini-4-hydrogen-preview").thinking
    ).toMatchObject({ defaultLevel: "high" });
  });

  it.each([
    ["gemini-4-argon", ["low", "medium", "high"], "medium"],
    ["gemini-3.8-flash", ["low", "medium", "high"], "medium"],
    ["gemini-3.6-flash", ["low", "medium", "high"], "medium"],
    ["gemini-3.1-flash-lite", ["low", "medium", "high"], "minimal"],
    ["gemini-3-flash", ["low", "medium", "high"], "high"],
    ["gemini-4-neon-preview", ["low", "medium", "high"], "medium"],
    ["gemini-3.1-pro-preview", ["low", "high"], "high"]
  ])("%s takes %j, default %s", (model, levels, defaultLevel) => {
    expect(geminiModelCapabilities(model).thinking).toEqual({
      kind: "level",
      levels,
      defaultLevel
    });
  });

  it("uses a thinking budget for Gemini 2.5 and nothing for older models", () => {
    expect(geminiModelCapabilities("gemini-2.5-pro")).toEqual({
      thinking: { kind: "budget" },
      combinesBuiltInAndFunctionTools: false
    });
    expect(geminiModelCapabilities("gemini-2.0-flash")).toEqual({
      thinking: null,
      combinesBuiltInAndFunctionTools: false
    });
  });

  it("gives speech, image and embedding models no thinking setting", () => {
    for (const model of [
      "gemini-3.8-flash-tts",
      "gemini-3-pro-image",
      "gemini-4-hydrogen-live",
      "gemini-embedding-001"
    ]) {
      expect(geminiModelCapabilities(model).thinking).toBeNull();
    }
  });

  it("allows built-in tools with functions on Gemini 3 and 4 only", () => {
    expect(
      geminiModelCapabilities("gemini-3.5-flash").combinesBuiltInAndFunctionTools
    ).toBe(true);
    expect(
      geminiModelCapabilities("gemini-4-hydrogen").combinesBuiltInAndFunctionTools
    ).toBe(true);
    expect(
      geminiModelCapabilities("gemini-5-flash").combinesBuiltInAndFunctionTools
    ).toBe(false);
    expect(
      geminiModelCapabilities("unknown-preview").combinesBuiltInAndFunctionTools
    ).toBe(false);
  });
});
