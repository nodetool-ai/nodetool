import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { _matchesAnyPattern, _matchesAnyPatternCi } from "../src/hf-models.js";

describe("model fnmatch patterns", () => {
  it.each([
    ["", "", true], ["", "*", true], ["", "?", false],
    ["owner/model.gguf", "*.gguf", true], ["owner/model.gguf", "owner/?odel.*", true],
    ["model[1].(bin)+$^{}|\\", "model[1].(bin)+$^{}|\\", true],
    ["model1.bin", "model[1].bin", false],
    ["ab", "a***?", true], ["abc", "a?", false],
    ["a\nb", "a*b", false], ["a\nb", "a?b", false], ["a\nb", "a\nb", true],
    ["x\ry", "*", false], ["x\u2028y", "*", false], ["x\u2029y", "*", false],
    ["😀", "??", true], ["😀", "?", false]
  ])("matches %j against literal/simple glob %j", (value, pattern, expected) => {
    expect(_matchesAnyPattern(value, [pattern])).toBe(expected);
  });

  it("preserves case-sensitive, case-insensitive and empty-list behavior", () => {
    expect(_matchesAnyPattern("MODEL.GGUF", ["*.gguf"])).toBe(false);
    expect(_matchesAnyPatternCi("MODEL.GGUF", ["*.gguf"])).toBe(true);
    expect(_matchesAnyPatternCi("İ/model", ["i̇/*"])).toBe(true);
    expect(_matchesAnyPattern("anything", [])).toBe(true);
    expect(_matchesAnyPatternCi("anything", [])).toBe(false);
  });

  it("finishes adversarial repeated-star rejection without regex backtracking", () => {
    const source = new URL("../src/hf-models.ts", import.meta.url).href;
    const child = spawnSync(process.execPath, ["--conditions=nodetool-dev", "--import", "tsx", "--input-type=module", "-e", `import { _matchesAnyPattern } from ${JSON.stringify(source)}; process.stdout.write(String(_matchesAnyPattern("a".repeat(64), ["*a".repeat(32)+"b"])));`], { encoding: "utf8", timeout: 5000 });
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(0);
    expect(child.stdout).toBe("false");
  }, 10000);
});
