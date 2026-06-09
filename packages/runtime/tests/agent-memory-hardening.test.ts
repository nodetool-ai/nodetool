/**
 * Mutation-hardening tests for AgentMemory.
 *
 * Pins the exact formatForPrompt rendering, the filter predicates by the
 * identity (not just count) of what they keep, the createdAt precedence, and
 * the listener error path (observable via console.error). See MUTATION_TESTING.md.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { AgentMemory } from "../src/agent-memory.js";

afterEach(() => vi.restoreAllMocks());

describe("set — createdAt precedence", () => {
  it("an explicit createdAt overrides an existing one", () => {
    const m = new AgentMemory();
    m.set({ key: "k", kind: "input", value: 1, createdAt: 100 });
    m.set({ key: "k", kind: "input", value: 2, createdAt: 200 });
    expect(m.get("k")?.createdAt).toBe(200);
  });

  it("defaults createdAt to ~now for a brand-new entry", () => {
    const m = new AgentMemory();
    const before = Date.now();
    const e = m.set({ key: "k", kind: "input", value: 1 });
    expect(e.createdAt).toBeGreaterThanOrEqual(before);
  });
});

describe("set — listener error handling", () => {
  it("logs (console.error) and keeps going when a listener throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const m = new AgentMemory();
    const after = vi.fn();
    m.subscribe(() => {
      throw new Error("boom");
    });
    m.subscribe(after);
    const entry = m.set({ key: "step:s1", kind: "step_result", value: 1 });
    expect(after).toHaveBeenCalledTimes(1); // later listener still ran
    expect(entry.key).toBe("step:s1"); // set still completed
    expect(spy).toHaveBeenCalledWith(
      "AgentMemory listener failed",
      expect.objectContaining({ key: "step:s1" })
    );
  });
});

describe("delete / snapshot", () => {
  it("delete removes an entry and reports whether one was removed", () => {
    const m = new AgentMemory();
    m.set({ key: "k", kind: "input", value: 1 });
    expect(m.delete("k")).toBe(true);
    expect(m.has("k")).toBe(false);
    expect(m.delete("k")).toBe(false);
  });

  it("snapshot returns all entries in insertion order", () => {
    const m = new AgentMemory();
    m.set({ key: "a", kind: "input", value: 1 });
    m.set({ key: "b", kind: "input", value: 2 });
    expect(m.snapshot().map((e) => e.key)).toEqual(["a", "b"]);
  });
});

describe("list — filters keep the RIGHT entries (not just the right count)", () => {
  const build = () => {
    const m = new AgentMemory();
    m.set({ key: "step:s1", kind: "step_result", value: 1, source: "s1" });
    m.set({ key: "step:s2", kind: "step_result", value: 2, source: "s2" });
    m.set({ key: "task:t1", kind: "task_result", value: 3, source: "t1" });
    return m;
  };

  it("keys filter keeps exactly the listed keys", () => {
    expect(build().list({ keys: ["task:t1"] }).map((e) => e.key)).toEqual([
      "task:t1"
    ]);
  });

  it("keyPrefix filter keeps exactly the prefixed keys", () => {
    expect(
      build()
        .list({ keyPrefix: "step:" })
        .map((e) => e.key)
    ).toEqual(["step:s1", "step:s2"]);
  });

  it("sources filter excludes entries with no/other source", () => {
    const m = build();
    m.set({ key: "nosrc", kind: "input", value: 9 }); // no source
    expect(m.list({ sources: ["s2"] }).map((e) => e.key)).toEqual(["step:s2"]);
  });

  it("no filter returns everything", () => {
    expect(build().list()).toHaveLength(3);
  });
});

describe("formatForPrompt — exact rendering", () => {
  it("renders an object value (with description) as a JSON code block", () => {
    const m = new AgentMemory();
    m.set({
      key: "task:t1",
      kind: "task_result",
      value: { a: 1 },
      title: "T",
      description: "D",
      createdAt: 1
    });
    expect(m.formatForPrompt()).toBe(
      [
        "# Memory (results from prior steps and tasks)",
        "",
        "## [task_result] T (task:t1)",
        "D",
        "```",
        '{\n  "a": 1\n}',
        "```"
      ].join("\n")
    );
  });

  it("renders a string value with no description and falls back to key as heading", () => {
    const m = new AgentMemory();
    m.set({
      key: "step:s1",
      kind: "step_result",
      value: "hello",
      createdAt: 1
    });
    expect(m.formatForPrompt()).toBe(
      [
        "# Memory (results from prior steps and tasks)",
        "",
        "## [step_result] step:s1 (step:s1)",
        "```",
        "hello",
        "```"
      ].join("\n")
    );
  });

  it("orders entries by createdAt ascending", () => {
    const m = new AgentMemory();
    m.set({ key: "b", kind: "input", value: "B", createdAt: 200, title: "B" });
    m.set({ key: "a", kind: "input", value: "A", createdAt: 100, title: "A" });
    const out = m.formatForPrompt();
    expect(out.indexOf("(a)")).toBeLessThan(out.indexOf("(b)"));
  });

  it("returns empty string when nothing matches", () => {
    expect(new AgentMemory().formatForPrompt()).toBe("");
  });
});

describe("clear", () => {
  it("clears everything when no filter is given", () => {
    const m = new AgentMemory();
    m.set({ key: "a", kind: "input", value: 1 });
    m.set({ key: "b", kind: "task_result", value: 2 });
    m.clear();
    expect(m.size()).toBe(0);
  });

  it("clears only matching entries when filtered", () => {
    const m = new AgentMemory();
    m.set({ key: "a", kind: "input", value: 1 });
    m.set({ key: "b", kind: "task_result", value: 2 });
    m.clear({ kind: "input" });
    expect(m.snapshot().map((e) => e.key)).toEqual(["b"]);
  });
});
