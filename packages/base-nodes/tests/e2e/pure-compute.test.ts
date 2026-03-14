import { describe, it, expect } from "vitest";
import { makeRegistry, makeRunner, nd, inp, de } from "./helpers.js";

describe("pure-compute e2e", () => {
  // --- Math nodes ---

  it("lib.math.Add adds two numbers", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);
    const result = await runner.run(
      { job_id: "t1" },
      {
        nodes: [nd("add", "lib.math.Add", { name: "out", properties: { a: 3, b: 7 } })],
        edges: [],
      }
    );
    expect(result.status).toBe("completed");
    expect(result.outputs.out).toContain(10);
  });

  it("lib.math.Multiply multiplies two numbers", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);
    const result = await runner.run(
      { job_id: "t2" },
      {
        nodes: [nd("mul", "lib.math.Multiply", { name: "out", properties: { a: 4, b: 5 } })],
        edges: [],
      }
    );
    expect(result.status).toBe("completed");
    expect(result.outputs.out).toContain(20);
  });

  it("lib.math.Sqrt computes square root", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);
    const result = await runner.run(
      { job_id: "t3" },
      {
        nodes: [nd("sqrt", "lib.math.Sqrt", { name: "out", properties: { x: 16 } })],
        edges: [],
      }
    );
    expect(result.status).toBe("completed");
    expect(result.outputs.out).toContain(4);
  });

  it("lib.math.MathFunction negates a number", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);
    const result = await runner.run(
      { job_id: "t4" },
      {
        nodes: [
          nd("neg", "lib.math.MathFunction", {
            name: "out",
            properties: { input: 42, operation: "negate" },
          }),
        ],
        edges: [],
      }
    );
    expect(result.status).toBe("completed");
    expect(result.outputs.out).toContain(-42);
  });

  it("lib.math.MathFunction computes square_root", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);
    const result = await runner.run(
      { job_id: "t5" },
      {
        nodes: [
          nd("fn", "lib.math.MathFunction", {
            name: "out",
            properties: { input: 25, operation: "square_root" },
          }),
        ],
        edges: [],
      }
    );
    expect(result.status).toBe("completed");
    expect(result.outputs.out).toContain(5);
  });

  // --- Math pipeline: (3+7) * 2 = 20 ---

  it("chains Add into Multiply via edges", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);
    const result = await runner.run(
      { job_id: "t6" },
      {
        nodes: [
          nd("add", "lib.math.Add", { properties: { a: 3, b: 7 } }),
          nd("mul", "lib.math.Multiply", { name: "out", properties: { b: 2 } }),
        ],
        edges: [de("add", "output", "mul", "a")],
      }
    );
    expect(result.status).toBe("completed");
    expect(result.outputs.out).toContain(20);
  });

  // --- JSON nodes ---

  it("lib.json.ParseDict parses a JSON string", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);
    const result = await runner.run(
      { job_id: "t7" },
      {
        nodes: [
          nd("parse", "lib.json.ParseDict", {
            name: "out",
            properties: { json_string: '{"x":1,"y":2}' },
          }),
        ],
        edges: [],
      }
    );
    expect(result.status).toBe("completed");
    expect(result.outputs.out).toContainEqual({ x: 1, y: 2 });
  });

  it("lib.json.StringifyJSON serializes data", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);
    const result = await runner.run(
      { job_id: "t8" },
      {
        nodes: [
          nd("str", "lib.json.StringifyJSON", {
            name: "out",
            properties: { data: { hello: "world" }, indent: 0 },
          }),
        ],
        edges: [],
      }
    );
    expect(result.status).toBe("completed");
    const output = result.outputs.out[0] as string;
    expect(JSON.parse(output)).toEqual({ hello: "world" });
  });

  // --- Text nodes ---

  it("nodetool.text.Concat concatenates two strings via properties", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);
    const result = await runner.run(
      { job_id: "t9" },
      {
        nodes: [
          nd("concat", "nodetool.text.Concat", {
            name: "out",
            properties: { a: "hello", b: " world" },
          }),
        ],
        edges: [],
      }
    );
    expect(result.status).toBe("completed");
    expect(result.outputs.out).toContain("hello world");
  });

  it("nodetool.text.Template renders a template string", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);
    const result = await runner.run(
      { job_id: "t10" },
      {
        nodes: [
          nd("tpl", "nodetool.text.Template", {
            name: "out",
            properties: {
              string: "Hello {{name}}, you are {{age}} years old",
              values: { name: "Alice", age: "30" },
            },
          }),
        ],
        edges: [],
      }
    );
    expect(result.status).toBe("completed");
    expect(result.outputs.out).toContain("Hello Alice, you are 30 years old");
  });

  it("nodetool.text.Join joins an array of strings", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);
    const result = await runner.run(
      { job_id: "t11" },
      {
        nodes: [
          nd("join", "nodetool.text.Join", {
            name: "out",
            properties: { strings: ["a", "b", "c"], separator: "-" },
          }),
        ],
        edges: [],
      }
    );
    expect(result.status).toBe("completed");
    expect(result.outputs.out).toContain("a-b-c");
  });

  // --- Boolean nodes ---

  it("nodetool.boolean.LogicalOperator performs AND", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);
    const result = await runner.run(
      { job_id: "t12" },
      {
        nodes: [
          nd("and", "nodetool.boolean.LogicalOperator", {
            name: "out",
            properties: { a: true, b: false, operation: "and" },
          }),
        ],
        edges: [],
      }
    );
    expect(result.status).toBe("completed");
    expect(result.outputs.out).toContain(false);
  });

  it("nodetool.boolean.Not negates a boolean", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);
    const result = await runner.run(
      { job_id: "t13" },
      {
        nodes: [
          nd("not", "nodetool.boolean.Not", {
            name: "out",
            properties: { value: true },
          }),
        ],
        edges: [],
      }
    );
    expect(result.status).toBe("completed");
    expect(result.outputs.out).toContain(false);
  });

  it("nodetool.boolean.Compare checks greater than", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);
    const result = await runner.run(
      { job_id: "t14" },
      {
        nodes: [
          nd("cmp", "nodetool.boolean.Compare", {
            name: "out",
            properties: { a: 10, b: 5, comparison: ">" },
          }),
        ],
        edges: [],
      }
    );
    expect(result.status).toBe("completed");
    expect(result.outputs.out).toContain(true);
  });

  // --- List nodes ---

  it("nodetool.list.Append appends a value to a list", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);
    const result = await runner.run(
      { job_id: "t15" },
      {
        nodes: [
          nd("app", "nodetool.list.Append", {
            name: "out",
            properties: { values: [1, 2, 3], value: 4 },
          }),
        ],
        edges: [],
      }
    );
    expect(result.status).toBe("completed");
    expect(result.outputs.out).toContainEqual([1, 2, 3, 4]);
  });

  it("nodetool.list.Length returns the length of a list", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);
    const result = await runner.run(
      { job_id: "t16" },
      {
        nodes: [
          nd("len", "nodetool.list.Length", {
            name: "out",
            properties: { values: [10, 20, 30] },
          }),
        ],
        edges: [],
      }
    );
    expect(result.status).toBe("completed");
    expect(result.outputs.out).toContain(3);
  });

  it("nodetool.list.Sum sums a list of numbers", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);
    const result = await runner.run(
      { job_id: "t17" },
      {
        nodes: [
          nd("sum", "nodetool.list.Sum", {
            name: "out",
            properties: { values: [1, 2, 3, 4, 5] },
          }),
        ],
        edges: [],
      }
    );
    expect(result.status).toBe("completed");
    expect(result.outputs.out).toContain(15);
  });

  it("nodetool.list.Reverse reverses a list", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);
    const result = await runner.run(
      { job_id: "t18" },
      {
        nodes: [
          nd("rev", "nodetool.list.Reverse", {
            name: "out",
            properties: { values: [1, 2, 3] },
          }),
        ],
        edges: [],
      }
    );
    expect(result.status).toBe("completed");
    expect(result.outputs.out).toContainEqual([3, 2, 1]);
  });

  // --- Pipeline: input nodes feeding into compute ---

  it("passes input params through edges to Concat", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);
    const result = await runner.run(
      { job_id: "t19", params: { a: "foo", b: "bar" } },
      {
        nodes: [
          inp("a", "a"),
          inp("b", "b"),
          nd("concat", "nodetool.text.Concat", { name: "out" }),
        ],
        edges: [
          de("a", "output", "concat", "a"),
          de("b", "output", "concat", "b"),
        ],
      }
    );
    expect(result.status).toBe("completed");
    expect(result.outputs.out).toContain("foobar");
  });

  it("multi-step pipeline: Add -> Sqrt", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);
    const result = await runner.run(
      { job_id: "t20" },
      {
        nodes: [
          nd("add", "lib.math.Add", { properties: { a: 7, b: 9 } }),
          nd("sqrt", "lib.math.Sqrt", { name: "out" }),
        ],
        edges: [de("add", "output", "sqrt", "x")],
      }
    );
    expect(result.status).toBe("completed");
    expect(result.outputs.out).toContain(4);
  });

  // --- Boolean pipeline: Compare -> Not ---

  it("pipeline: Compare -> Not inverts comparison result", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);
    const result = await runner.run(
      { job_id: "t21" },
      {
        nodes: [
          nd("cmp", "nodetool.boolean.Compare", { properties: { a: 3, b: 5, comparison: ">" } }),
          nd("not", "nodetool.boolean.Not", { name: "out" }),
        ],
        edges: [de("cmp", "output", "not", "value")],
      }
    );
    expect(result.status).toBe("completed");
    // 3 > 5 is false, Not(false) is true
    expect(result.outputs.out).toContain(true);
  });
});
