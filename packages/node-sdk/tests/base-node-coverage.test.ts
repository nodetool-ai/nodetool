/**
 * Additional BaseNode tests for coverage:
 *  - initialize() default no-op
 *  - genProcess() default yields process result
 */

import { describe, it, expect } from "vitest";
import { BaseNode } from "../src/base-node.js";

class SimpleNode extends BaseNode {
  static readonly nodeType = "test.Simple";
  static readonly title = "Simple";
  static readonly description = "A simple test node";

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    return { out: inputs.value ?? "default" };
  }
}

describe("BaseNode – initialize()", () => {
  it("default initialize is a no-op that resolves", async () => {
    const node = new SimpleNode();
    await expect(node.initialize()).resolves.toBeUndefined();
  });
});

describe("BaseNode – genProcess() default", () => {
  it("default genProcess yields the process result", async () => {
    const node = new SimpleNode();
    const results: Record<string, unknown>[] = [];

    for await (const item of node.genProcess({ value: 42 })) {
      results.push(item);
    }

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ out: 42 });
  });

  it("genProcess via executor also works", async () => {
    const node = new SimpleNode();
    const executor = node.toExecutor();
    const results: Record<string, unknown>[] = [];

    for await (const item of executor.genProcess!({ value: "hello" })) {
      results.push(item);
    }

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ out: "hello" });
  });
});

describe("BaseNode – executor initialize()", () => {
  it("executor initialize calls node initialize", async () => {
    const calls: string[] = [];

    class InitNode extends BaseNode {
      static readonly nodeType = "test.Init";
      async initialize() {
        calls.push("initialized");
      }
      async process() {
        return {};
      }
    }

    const node = new InitNode();
    const executor = node.toExecutor();
    await executor.initialize!();

    expect(calls).toEqual(["initialized"]);
  });
});
