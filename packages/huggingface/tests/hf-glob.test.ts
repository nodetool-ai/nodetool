import { describe, expect, it } from "vitest";
import { matchesGlob } from "../src/hf-download-manager.js";

describe("matchesGlob", () => {
  it.each([
    ["*.safetensors", "model-00001-of-00002.safetensors", true],
    ["*.safetensors", "sub/model.safetensors", false],
    ["**/*.onnx", "onnx/model.onnx", true],
    ["**/*.onnx", "model.onnx", true],
    ["model-?????-*", "model-00001-of-00002.safetensors", true],
    ["a/**/b", "a/x/y/b", true],
    ["text_encoder/*", "text_encoder/model.bin", true],
    ["text_encoder/*", "text_encoder/sub/model.bin", false],
    ["?", "/", false]
  ])("%s against %s is %s", (pattern, path, expected) => {
    expect(matchesGlob(pattern, path)).toBe(expected);
  });

  it("stays linear on patterns that make a backtracking regex explode", () => {
    const started = performance.now();
    expect(matchesGlob("*?".repeat(256) + "X", "model-00001-of-00002.safetensors")).toBe(false);
    expect(performance.now() - started).toBeLessThan(250);
  });
});
