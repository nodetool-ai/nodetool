import { describe, expect, it, vi } from "vitest";
import { AgentMemory, memoryKeys } from "../src/agent-memory.js";

describe("AgentMemory", () => {
  it("stores and retrieves entries by key", () => {
    const m = new AgentMemory();
    m.set({
      key: memoryKeys.task("t1"),
      kind: "task_result",
      value: { foo: "bar" },
      source: "t1",
      title: "Task One"
    });

    const entry = m.get("task:t1");
    expect(entry?.value).toEqual({ foo: "bar" });
    expect(entry?.kind).toBe("task_result");
    expect(m.getValue("task:t1")).toEqual({ foo: "bar" });
    expect(m.has("task:t1")).toBe(true);
    expect(m.size()).toBe(1);
  });

  it("filters list() by kind, keys, prefix, and source", () => {
    const m = new AgentMemory();
    m.set({ key: "step:s1", kind: "step_result", value: 1, source: "s1" });
    m.set({ key: "step:s2", kind: "step_result", value: 2, source: "s2" });
    m.set({ key: "task:t1", kind: "task_result", value: 3, source: "t1" });
    m.set({ key: "input:foo", kind: "input", value: 4, source: "input" });

    expect(m.list({ kind: "step_result" })).toHaveLength(2);
    expect(m.list({ kind: ["task_result", "input"] })).toHaveLength(2);
    expect(m.list({ keys: ["step:s1", "task:t1"] })).toHaveLength(2);
    expect(m.list({ keyPrefix: "step:" })).toHaveLength(2);
    expect(m.list({ sources: ["s1"] })).toHaveLength(1);
  });

  it("preserves the original createdAt on overwrite", () => {
    const m = new AgentMemory();
    m.set({
      key: "step:s1",
      kind: "step_result",
      value: 1,
      createdAt: 100
    });
    m.set({ key: "step:s1", kind: "step_result", value: 2 });
    expect(m.get("step:s1")?.value).toBe(2);
    expect(m.get("step:s1")?.createdAt).toBe(100);
  });

  it("notifies subscribers on writes", () => {
    const m = new AgentMemory();
    const listener = vi.fn();
    const unsubscribe = m.subscribe(listener);
    m.set({ key: "step:s1", kind: "step_result", value: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].key).toBe("step:s1");

    unsubscribe();
    m.set({ key: "step:s2", kind: "step_result", value: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("renders entries as a Markdown prompt block", () => {
    const m = new AgentMemory();
    m.set({
      key: "task:research",
      kind: "task_result",
      value: { findings: ["a", "b"] },
      source: "research",
      title: "Research findings",
      createdAt: 1
    });
    m.set({
      key: "task:summary",
      kind: "task_result",
      value: "A short summary string.",
      source: "summary",
      title: "Summary",
      createdAt: 2
    });

    const block = m.formatForPrompt({ kind: "task_result" });
    expect(block).toContain("# Memory");
    expect(block).toContain("## [task_result] Research findings (task:research)");
    expect(block).toContain("findings");
    expect(block).toContain("## [task_result] Summary (task:summary)");
    expect(block).toContain("A short summary string.");
  });

  it("returns empty string when no entries match formatForPrompt filter", () => {
    const m = new AgentMemory();
    m.set({ key: "step:s1", kind: "step_result", value: 1 });
    expect(m.formatForPrompt({ kind: "task_result" })).toBe("");
  });

  it("clears entries by filter or completely", () => {
    const m = new AgentMemory();
    m.set({ key: "step:s1", kind: "step_result", value: 1 });
    m.set({ key: "task:t1", kind: "task_result", value: 2 });
    m.clear({ kind: "step_result" });
    expect(m.has("step:s1")).toBe(false);
    expect(m.has("task:t1")).toBe(true);
    m.clear();
    expect(m.size()).toBe(0);
  });

  it("orders formatForPrompt by createdAt ascending", () => {
    const m = new AgentMemory();
    m.set({
      key: "step:b",
      kind: "step_result",
      value: "second",
      createdAt: 200,
      title: "B"
    });
    m.set({
      key: "step:a",
      kind: "step_result",
      value: "first",
      createdAt: 100,
      title: "A"
    });
    const block = m.formatForPrompt();
    const aIdx = block.indexOf("## [step_result] A");
    const bIdx = block.indexOf("## [step_result] B");
    expect(aIdx).toBeGreaterThanOrEqual(0);
    expect(bIdx).toBeGreaterThan(aIdx);
  });

  it("round-trips through snapshot() and restore() (durability seam)", () => {
    const source = new AgentMemory();
    source.set({
      key: memoryKeys.task("t1"),
      kind: "task_result",
      value: { foo: "bar" },
      createdAt: 123,
      title: "Task One"
    });
    source.set({
      key: memoryKeys.shared("note"),
      kind: "shared",
      value: "hello"
    });

    const snapshot = source.snapshot();

    // Simulate a fresh process restoring from a persisted checkpoint.
    const restored = new AgentMemory();
    const seen: string[] = [];
    restored.subscribe((e) => seen.push(e.key));
    restored.restore(snapshot);

    expect(restored.size()).toBe(2);
    expect(restored.getValue("task:t1")).toEqual({ foo: "bar" });
    expect(restored.get("task:t1")?.createdAt).toBe(123); // preserved
    expect(restored.getValue("shared:note")).toBe("hello");
    // Listeners fire for each restored entry so derived state can rebuild.
    expect(seen).toEqual(["task:t1", "shared:note"]);
  });

  it("restore() overwrites existing keys", () => {
    const m = new AgentMemory();
    m.set({ key: "shared:x", kind: "shared", value: "old" });
    m.restore([
      { key: "shared:x", kind: "shared", value: "new", createdAt: 5 }
    ]);
    expect(m.getValue("shared:x")).toBe("new");
    expect(m.size()).toBe(1);
  });
});
