import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEncoding } from "js-tiktoken";

const load = vi.hoisted(() => vi.fn());
vi.mock("@nodetool-ai/config", () => ({ importOptionalModule: load }));

const fixtures = [
  ["English sentence", "The quick brown fox jumps over the lazy dog."],
  ["English prose", "NodeTool lets you build visual workflows that connect models, tools, and data. Read the file before editing it, then run the relevant tests to check the result."],
  ["TypeScript function", 'export async function readFile(path: string): Promise<string> {\n  const bytes = await workspace.read(path);\n  return new TextDecoder("utf-8").decode(bytes);\n}\n'],
  ["TypeScript expression", "const rows = items.filter((item) => item.active).map(({ id, name }) => ({ id, name }));"],
  ["Chinese", "人工智能可以帮助我们分析数据、编写代码和理解复杂的问题。请先读取文件，然后运行测试来检查结果。"],
  ["Japanese", "こんにちは、世界。これは日本語の文章です。ファイルを読んでからテストを実行してください。"],
  ["Korean", "안녕하세요. 인공지능은 데이터를 분석하고 코드를 작성하는 데 도움이 됩니다."]
] as const;
const exact = getEncoding("cl100k_base");

beforeEach(() => {
  vi.resetModules();
  load.mockReset();
  load.mockRejectedValue(new Error("Cannot find package 'js-tiktoken'"));
});

describe("optional token counter", () => {
  it.each(fixtures)("estimates %s between exact and 35%% over", async (_, text) => {
    const counter = await import("../src/token-counter.js");
    await counter.initializeTokenCounter();
    const estimate = counter.countTokens(text);
    const actual = exact.encode(text, [], []).length;
    expect(estimate).toBeGreaterThanOrEqual(actual);
    expect(estimate).toBeLessThanOrEqual(actual * 1.35);
  });

  it("silently counts and truncates without the optional module", async () => {
    const counter = await import("../src/token-counter.js");
    await counter.initializeTokenCounter();
    expect(counter.countTokens(null)).toBe(0);
    expect(counter.countTokens(undefined)).toBe(0);
    expect(counter.countTokens("")).toBe(0);
    expect(counter.truncateToTokens("hello", 0)).toBe("");
    expect(counter.truncateToTokens("hello", 100)).toBe("hello");
    const texts: string[] = fixtures.map(([, text]) => text);
    texts.push("a😀".repeat(100));
    for (const text of texts) {
      const prefix = counter.truncateToTokens(text, 5);
      expect(text.startsWith(prefix)).toBe(true);
      expect(counter.countTokens(prefix)).toBeLessThanOrEqual(5);
      expect(prefix).not.toMatch(/[\uD800-\uDBFF]$/);
    }
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith("js-tiktoken");
  });

  it("handles a million-character single piece without BPE", async () => {
    const counter = await import("../src/token-counter.js");
    await counter.initializeTokenCounter();
    const text = "x".repeat(1_000_000);
    expect(counter.countTokens(text)).toBe(Math.ceil(text.length / 4.5));
    expect(counter.truncateToTokens(text, 10)).toBe("x".repeat(45));
  });

  it("keeps synchronous estimates until loading completes, then uses exact counts", async () => {
    let ready: ((library: { getEncoding: typeof getEncoding }) => void) | undefined;
    load.mockReturnValue(new Promise((resolve) => { ready = resolve; }));
    const counter = await import("../src/token-counter.js");
    expect(counter.countTokens("hello world")).toBe(3);
    const initialization = counter.initializeTokenCounter();
    if (!ready) { throw new Error("optional load did not start"); }
    ready({ getEncoding });
    await initialization;
    expect(counter.countTokens("hello world")).toBe(2);
    for (const [, text] of fixtures) {
      expect(counter.countTokens(text)).toBe(exact.encode(text, [], []).length);
    }
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("imports and estimates when the loader fails synchronously", async () => {
    load.mockImplementation(() => {
      throw new Error("loader unavailable");
    });
    const counter = await import("../src/token-counter.js");
    await counter.initializeTokenCounter();
    expect(counter.countTokens("hello world")).toBe(3);
  });
});
