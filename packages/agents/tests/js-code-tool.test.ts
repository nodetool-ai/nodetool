import { describe, it, expect } from "vitest";
import { MiniJSAgentTool } from "../src/tools/js-code-tool.js";
import type { ProcessingContext } from "@nodetool/runtime";

const mockContext = {
  resolveWorkspacePath: (p: string) => `/tmp/test-workspace/${p}`,
  getSecret: async (_name: string) => undefined,
  environment: {},
  userId: undefined
} as unknown as ProcessingContext;

describe("MiniJSAgentTool", () => {
  const tool = new MiniJSAgentTool({ timeoutMs: 5000 });

  it("has correct name and schema", () => {
    expect(tool.name).toBe("js");
    const pt = tool.toProviderTool();
    expect(pt.inputSchema).toBeDefined();
    expect((pt.inputSchema as Record<string, unknown>)["required"]).toEqual([
      "code"
    ]);
  });

  // --- Basic expressions ---

  it("returns a simple number", async () => {
    const result = await tool.process(mockContext, { code: "return 42" });
    expect(result).toEqual({ success: true, result: 42 });
  });

  it("returns a string", async () => {
    const result = await tool.process(mockContext, { code: 'return "hello"' });
    expect(result).toEqual({ success: true, result: "hello" });
  });

  it("returns an object", async () => {
    const result = await tool.process(mockContext, {
      code: 'return { name: "test", value: 123 }'
    });
    expect(result).toEqual({
      success: true,
      result: { name: "test", value: 123 }
    });
  });

  it("returns null for no return", async () => {
    const result = (await tool.process(mockContext, {
      code: "const x = 1;"
    })) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.result).toBeNull();
  });

  // --- Console logging ---

  it("captures console.log output", async () => {
    const result = (await tool.process(mockContext, {
      code: 'console.log("step 1"); console.log("step 2"); return "done"'
    })) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.logs).toEqual(["step 1", "step 2"]);
    expect(result.result).toBe("done");
  });

  it("captures console.warn and console.error", async () => {
    const result = (await tool.process(mockContext, {
      code: 'console.warn("warning"); console.error("error"); return true'
    })) as Record<string, unknown>;
    expect(result.logs).toEqual(["[warn] warning", "[error] error"]);
  });

  // --- Loops ---

  it("supports for loops", async () => {
    const result = (await tool.process(mockContext, {
      code: `
        let sum = 0;
        for (let i = 1; i <= 10; i++) {
          sum += i;
        }
        return sum;
      `
    })) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.result).toBe(55);
  });

  it("supports while loops", async () => {
    const result = (await tool.process(mockContext, {
      code: `
        let n = 1;
        while (n < 100) n *= 2;
        return n;
      `
    })) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.result).toBe(128);
  });

  it("supports for...of loops", async () => {
    const result = (await tool.process(mockContext, {
      code: `
        const items = ["a", "b", "c"];
        const upper = [];
        for (const item of items) {
          upper.push(item.toUpperCase());
        }
        return upper;
      `
    })) as Record<string, unknown>;
    expect(result.result).toEqual(["A", "B", "C"]);
  });

  // --- Conditionals ---

  it("supports if/else", async () => {
    const result = (await tool.process(mockContext, {
      code: `
        const x = 10;
        if (x > 5) {
          return "big";
        } else {
          return "small";
        }
      `
    })) as Record<string, unknown>;
    expect(result.result).toBe("big");
  });

  it("supports ternary operator", async () => {
    const result = (await tool.process(mockContext, {
      code: "return 3 > 2 ? 'yes' : 'no';"
    })) as Record<string, unknown>;
    expect(result.result).toBe("yes");
  });

  it("supports switch statement", async () => {
    const result = (await tool.process(mockContext, {
      code: `
        const day = "monday";
        switch (day) {
          case "monday": return "start";
          case "friday": return "end";
          default: return "middle";
        }
      `
    })) as Record<string, unknown>;
    expect(result.result).toBe("start");
  });

  // --- Functions ---

  it("supports function declarations", async () => {
    const result = (await tool.process(mockContext, {
      code: `
        function factorial(n) {
          if (n <= 1) return 1;
          return n * factorial(n - 1);
        }
        return factorial(5);
      `
    })) as Record<string, unknown>;
    expect(result.result).toBe(120);
  });

  it("supports arrow functions", async () => {
    const result = (await tool.process(mockContext, {
      code: `
        const double = x => x * 2;
        return [1, 2, 3].map(double);
      `
    })) as Record<string, unknown>;
    expect(result.result).toEqual([2, 4, 6]);
  });

  // --- Array methods ---

  it("supports map/filter/reduce", async () => {
    const result = (await tool.process(mockContext, {
      code: `
        const data = [1, 2, 3, 4, 5, 6];
        const evens = data.filter(x => x % 2 === 0);
        const doubled = evens.map(x => x * 2);
        const total = doubled.reduce((a, b) => a + b, 0);
        return { evens, doubled, total };
      `
    })) as Record<string, unknown>;
    expect(result.result).toEqual({
      evens: [2, 4, 6],
      doubled: [4, 8, 12],
      total: 24
    });
  });

  // --- Destructuring and spread ---

  it("supports destructuring and spread", async () => {
    const result = (await tool.process(mockContext, {
      code: `
        const [a, b, ...rest] = [1, 2, 3, 4, 5];
        const { x, y } = { x: 10, y: 20, z: 30 };
        return { a, b, rest, x, y };
      `
    })) as Record<string, unknown>;
    expect(result.result).toEqual({
      a: 1,
      b: 2,
      rest: [3, 4, 5],
      x: 10,
      y: 20
    });
  });

  // --- Template literals ---

  it("supports template literals", async () => {
    const result = (await tool.process(mockContext, {
      code: "const name = 'world'; return `hello ${name}!`;"
    })) as Record<string, unknown>;
    expect(result.result).toBe("hello world!");
  });

  // --- Async/await ---

  it("supports async/await with sleep", async () => {
    const result = (await tool.process(mockContext, {
      code: `
        await sleep(10);
        return "done";
      `
    })) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.result).toBe("done");
  });

  // --- Native JS patterns (no custom helpers) ---

  it("generates number ranges with Array.from", async () => {
    const result = (await tool.process(mockContext, {
      code: "return Array.from({length: 5}, (_, i) => i);"
    })) as Record<string, unknown>;
    expect(result.result).toEqual([0, 1, 2, 3, 4]);
  });

  it("deduplicates with Set", async () => {
    const result = (await tool.process(mockContext, {
      code: "return [...new Set([1, 2, 2, 3, 3, 3])];"
    })) as Record<string, unknown>;
    expect(result.result).toEqual([1, 2, 3]);
  });

  it("groups objects with reduce", async () => {
    const result = (await tool.process(mockContext, {
      code: `
        const data = [
          { type: "a", val: 1 },
          { type: "b", val: 2 },
          { type: "a", val: 3 },
        ];
        return data.reduce((acc, item) => {
          (acc[item.type] ||= []).push(item);
          return acc;
        }, {});
      `
    })) as Record<string, unknown>;
    expect(result.result).toEqual({
      a: [
        { type: "a", val: 1 },
        { type: "a", val: 3 }
      ],
      b: [{ type: "b", val: 2 }]
    });
  });

  it("computes sum/avg/min/max with native methods", async () => {
    const result = (await tool.process(mockContext, {
      code: `
        const data = [10, 20, 30, 40, 50];
        return {
          sum: data.reduce((a, b) => a + b, 0),
          avg: data.reduce((a, b) => a + b, 0) / data.length,
          min: Math.min(...data),
          max: Math.max(...data),
        };
      `
    })) as Record<string, unknown>;
    expect(result.result).toEqual({ sum: 150, avg: 30, min: 10, max: 50 });
  });

  it("plucks fields with map", async () => {
    const result = (await tool.process(mockContext, {
      code: `
        const users = [{name: "Alice"}, {name: "Bob"}, {name: "Carol"}];
        return users.map(u => u.name);
      `
    })) as Record<string, unknown>;
    expect(result.result).toEqual(["Alice", "Bob", "Carol"]);
  });

  it("picks object keys with destructuring", async () => {
    const result = (await tool.process(mockContext, {
      code: `
        const { a, c } = { a: 1, b: 2, c: 3 };
        return { a, c };
      `
    })) as Record<string, unknown>;
    expect(result.result).toEqual({ a: 1, c: 3 });
  });

  it("does deep object access with optional chaining", async () => {
    const result = (await tool.process(mockContext, {
      code: `
        const data = { user: { profile: { name: "Alice" } } };
        return data?.user?.profile?.name;
      `
    })) as Record<string, unknown>;
    expect(result.result).toBe("Alice");
  });

  it("string methods work natively", async () => {
    const result = (await tool.process(mockContext, {
      code: `
        return {
          upper: "hello".toUpperCase(),
          lower: "WORLD".toLowerCase(),
          lines: "a\\nb\\nc".split("\\n"),
          reversed: [..."abc"].reverse().join(""),
        };
      `
    })) as Record<string, unknown>;
    expect(result.result).toEqual({
      upper: "HELLO",
      lower: "world",
      lines: ["a", "b", "c"],
      reversed: "cba"
    });
  });

  it("URL class constructs URLs", async () => {
    // QuickJS's URL doesn't propagate searchParams mutations back; build the
    // query via URLSearchParams directly and concatenate.
    const result = (await tool.process(mockContext, {
      code: `
        const u = new URL("https://api.example.com/search");
        const p = new URLSearchParams();
        p.set("q", "test");
        p.set("page", "2");
        return u.origin + u.pathname + "?" + p.toString();
      `
    })) as Record<string, unknown>;
    expect(result.result).toContain("q=test");
    expect(result.result).toContain("page=2");
  });

  it("URL class parses components", async () => {
    // QuickJS's URLSearchParams only implements forEach (no
    // keys/values/entries/Symbol.iterator), so build the params dict via
    // forEach instead of `for..of` iteration.
    const result = (await tool.process(mockContext, {
      code: `
        const u = new URL("https://example.com/path?foo=bar&baz=1");
        const p = new URLSearchParams(u.search);
        const params = {};
        p.forEach((v, k) => { params[k] = v; });
        return {
          hostname: u.hostname,
          pathname: u.pathname,
          params,
        };
      `
    })) as Record<string, unknown>;
    expect(result.result).toEqual({
      hostname: "example.com",
      pathname: "/path",
      params: { foo: "bar", baz: "1" }
    });
  });

  it("uuid() returns a UUID", async () => {
    const result = (await tool.process(mockContext, {
      code: `
        const id = uuid();
        return typeof id === "string" && id.length === 36;
      `
    })) as Record<string, unknown>;
    expect(result.result).toBe(true);
  });

  it("Date works natively", async () => {
    const result = (await tool.process(mockContext, {
      code: `
        const ts = Date.now();
        const iso = new Date().toISOString();
        return typeof ts === "number" && typeof iso === "string" && iso.includes("T");
      `
    })) as Record<string, unknown>;
    expect(result.result).toBe(true);
  });

  // --- Error handling ---

  it("returns error for empty code", async () => {
    const result = (await tool.process(mockContext, {
      code: ""
    })) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain("No code");
  });

  it("catches runtime errors", async () => {
    const result = (await tool.process(mockContext, {
      code: "throw new Error('boom');"
    })) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain("boom");
  });

  it("catches reference errors", async () => {
    const result = (await tool.process(mockContext, {
      code: "return unknownVariable;"
    })) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain("unknownVariable");
  });

  it("supports try/catch in user code", async () => {
    const result = (await tool.process(mockContext, {
      code: `
        try {
          JSON.parse("invalid");
        } catch (e) {
          return { caught: true, message: e.message };
        }
      `
    })) as Record<string, unknown>;
    expect(result.success).toBe(true);
    const inner = result.result as Record<string, unknown>;
    expect(inner.caught).toBe(true);
  });

  // --- Complex real-world patterns ---

  it("does data transformation pipeline", async () => {
    const result = (await tool.process(mockContext, {
      code: `
        const rawData = [
          { name: "Alice", score: 85, dept: "eng" },
          { name: "Bob", score: 92, dept: "eng" },
          { name: "Carol", score: 78, dept: "sales" },
          { name: "Dave", score: 95, dept: "eng" },
          { name: "Eve", score: 88, dept: "sales" },
        ];

        // Group by department (vanilla reduce — sandbox is lib-free)
        const byDept = rawData.reduce((acc, item) => {
          (acc[item.dept] ||= []).push(item);
          return acc;
        }, {});

        // Calculate stats per department
        const stats = {};
        for (const [dept, members] of Object.entries(byDept)) {
          const scores = members.map(m => m.score);
          stats[dept] = {
            count: scores.length,
            avg: scores.reduce((a, b) => a + b, 0) / scores.length,
            top: [...members].sort((a, b) => b.score - a.score)[0].name,
          };
        }
        return stats;
      `
    })) as Record<string, unknown>;
    expect(result.success).toBe(true);
    const stats = result.result as Record<string, Record<string, unknown>>;
    expect(stats.eng.count).toBe(3);
    expect(stats.eng.top).toBe("Dave");
    expect(stats.sales.count).toBe(2);
  });

  it("builds and parses JSON", async () => {
    const result = (await tool.process(mockContext, {
      code: `
        const data = { users: [{ id: 1 }, { id: 2 }] };
        const json = JSON.stringify(data);
        const parsed = JSON.parse(json);
        return parsed.users.length;
      `
    })) as Record<string, unknown>;
    expect(result.result).toBe(2);
  });

  it("uses Map and Set", async () => {
    const result = (await tool.process(mockContext, {
      code: `
        const m = new Map();
        m.set("a", 1);
        m.set("b", 2);
        const s = new Set([1, 2, 2, 3]);
        return { mapSize: m.size, setSize: s.size, hasA: m.has("a") };
      `
    })) as Record<string, unknown>;
    expect(result.result).toEqual({ mapSize: 2, setSize: 3, hasA: true });
  });

  it("uses regex", async () => {
    const result = (await tool.process(mockContext, {
      code: `
        const text = "Contact: alice@example.com and bob@test.org";
        const emails = text.match(/[\\w.+-]+@[\\w.-]+\\.[a-z]{2,}/g);
        return emails;
      `
    })) as Record<string, unknown>;
    expect(result.result).toEqual(["alice@example.com", "bob@test.org"]);
  });

  // --- userMessage ---

  it("userMessage shows first line for short code", () => {
    const msg = tool.userMessage({ code: 'return "hello"' });
    expect(msg).toContain("JS");
    expect(msg).toContain("hello");
  });

  it("userMessage shows line count for long code", () => {
    const longFirstLine = "a".repeat(70);
    const msg = tool.userMessage({
      code: `${longFirstLine}\nline2\nline3\nline4\nline5`
    });
    expect(msg).toContain("5 lines");
  });
});
