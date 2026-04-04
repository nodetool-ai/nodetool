import { describe, it, expect } from "vitest";
import {
  Passthrough,
  Add,
  Multiply,
  Constant,
  StringConcat,
  FormatText,
  ThresholdProcessor,
  ErrorNode,
  SlowNode,
  StreamingCounter,
  IntAccumulator
} from "../src/nodes/test-nodes.js";

describe("Passthrough", () => {
  it("passes value through unchanged", async () => {
    const node = new Passthrough();
    node.assign({ value: 42 });
    const result = await node.process();
    expect(result.output).toBe(42);
  });
});

describe("Add", () => {
  it("adds two input numbers", async () => {
    const node = new Add();
    node.assign({ a: 3, b: 7 });
    const result = await node.process();
    expect(result.result).toBe(10);
  });

  it("uses defaults when no inputs provided", async () => {
    const node = new Add();
    node.assign({});
    const result = await node.process();
    expect(result.result).toBe(0);
  });
});

describe("Multiply", () => {
  it("multiplies two numbers", async () => {
    const node = new Multiply();
    node.assign({ a: 4, b: 5 });
    const result = await node.process();
    expect(result.result).toBe(20);
  });

  it("uses defaults when no inputs provided", async () => {
    const node = new Multiply();
    node.assign({});
    const result = await node.process();
    expect(result.result).toBe(1); // 1 * 1
  });

  it("returns correct defaults", () => {
    const node = new Multiply();
    expect(node.serialize()).toEqual({ a: 1, b: 1 });
  });
});

describe("Constant", () => {
  it("ignores inputs and returns configured value", async () => {
    const node = new Constant();
    node.assign({ value: 99 });
    const result = await node.process();
    expect(result.value).toBe(99);
  });
});

describe("StringConcat", () => {
  it("concatenates two strings", async () => {
    const node = new StringConcat();
    node.assign({ a: "hello", b: "world" });
    const result = await node.process();
    expect(result.result).toBe("helloworld");
  });

  it("uses separator when configured", async () => {
    const node = new StringConcat();
    node.assign({ separator: " ", a: "hello", b: "world" });
    const result = await node.process();
    expect(result.result).toBe("hello world");
  });
});

describe("FormatText", () => {
  it("replaces {{ text }} placeholder in template", async () => {
    const node = new FormatText();
    node.assign({ template: "Hello, {{ text }}!", text: "World" });
    const result = await node.process();
    expect(result.result).toBe("Hello, World!");
  });

  it("replaces multiple occurrences", async () => {
    const node = new FormatText();
    node.assign({ template: "{{ text }} + {{ text }}", text: "X" });
    const result = await node.process();
    expect(result.result).toBe("X + X");
  });
});

describe("ThresholdProcessor", () => {
  it("reports exceeds=true when value >= threshold (normal mode)", async () => {
    const node = new ThresholdProcessor();
    node.assign({ value: 0.5, threshold: 0.5 });
    const result = await node.process();
    expect(result.result).toContain("exceeds=true");
  });

  it("reports exceeds=false in strict mode when value === threshold", async () => {
    const node = new ThresholdProcessor();
    node.assign({ mode: "strict", value: 0.5, threshold: 0.5 });
    const result = await node.process();
    expect(result.result).toContain("exceeds=false");
  });
});

describe("ErrorNode", () => {
  it("always throws with the configured message", async () => {
    const node = new ErrorNode();
    node.assign({ message: "boom!" });
    await expect(node.process()).rejects.toThrow("boom!");
  });
});

describe("SlowNode", () => {
  it("delays and returns completed", async () => {
    const node = new SlowNode();
    node.assign({ delayMs: 10 });
    const result = await node.process();
    expect(result.result).toBe("completed");
  });
});

describe("StreamingCounter", () => {
  it("yields N items starting from start", async () => {
    const node = new StreamingCounter();
    node.assign({ count: 4, start: 2 });
    const values: unknown[] = [];
    for await (const item of node.genProcess()) {
      values.push(item.value);
    }
    expect(values).toEqual([2, 3, 4, 5]);
  });

  it("process() returns empty object (lines 157-160)", async () => {
    const node = new StreamingCounter();
    node.assign({ count: 3, start: 0 });
    const result = await node.process();
    expect(result).toEqual({});
  });
});

describe("IntAccumulator", () => {
  it("tracks execution count and accumulates values", async () => {
    const node = new IntAccumulator();
    node.assign({ value: 10 });
    const r1 = await node.process();
    node.assign({ value: 20 });
    const r2 = await node.process();
    expect(r1.count).toBe(1);
    expect(r1.value).toBe(10);
    expect(r2.count).toBe(2);
    expect(r2.values).toEqual([10, 20]);
  });

  it("uses default value 0 when no input provided (lines 183-184)", async () => {
    const node = new IntAccumulator();
    node.assign({});
    const result = await node.process();
    expect(result.value).toBe(0);
    expect(result.count).toBe(1);
    expect(result.values).toEqual([0]);
  });
});
