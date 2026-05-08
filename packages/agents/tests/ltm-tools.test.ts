/**
 * Tests for the explicit `ltm_recall` / `ltm_remember` tools.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync } from "node:fs";

import {
  SqliteVecProvider,
  type EmbeddingFunction,
  type VectorProvider
} from "@nodetool-ai/vectorstore";

import { LongTermMemory } from "../src/long-term-memory.js";
import {
  LtmRecallTool,
  LtmRememberTool,
  setLongTermMemory,
  getLongTermMemory,
  LTM_TOOL_NAMES
} from "../src/tools/ltm-tools.js";
import { createMockContext } from "./_helpers/mock-context.js";

const fakeEmbedder: EmbeddingFunction = {
  generate: async (texts) =>
    texts.map((t) => {
      const v = [0, 0, 0, 0];
      for (let i = 0; i < t.length; i++) v[i % 4] += t.charCodeAt(i);
      const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
      return v.map((x) => x / n);
    })
};

let provider: VectorProvider;
let dbPath: string;

beforeEach(() => {
  dbPath = join(
    tmpdir(),
    `ltm-tool-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
  );
  provider = new SqliteVecProvider({ dbPath });
});

afterEach(() => {
  setLongTermMemory("user-1", null);
  try {
    provider.close();
  } catch {}
  for (const ext of ["", "-wal", "-shm"]) {
    try {
      unlinkSync(dbPath + ext);
    } catch {}
  }
});

function newMemory(): LongTermMemory {
  return new LongTermMemory({
    userId: "user-1",
    namespace: "tools",
    vectorProvider: provider,
    embeddingFunction: fakeEmbedder,
    dedupeSimilarity: 0.95
  });
}

describe("ltm_remember", () => {
  it("stores a memory when an LTM is bound to the tool", async () => {
    const memory = newMemory();
    const tool = new LtmRememberTool(memory);
    const ctx = createMockContext();
    const result = (await tool.process(ctx, {
      text: "User prefers TypeScript",
      kind: "preference",
      importance: 0.8
    })) as { stored: boolean; id?: string };
    expect(result.stored).toBe(true);
    expect(result.id).toBeTruthy();
  });

  it("coerces an unknown kind back to 'fact' instead of trusting the assertion", async () => {
    const memory = newMemory();
    const tool = new LtmRememberTool(memory);
    const ctx = createMockContext();
    const result = (await tool.process(ctx, {
      text: "User likes pickles",
      kind: "totally-made-up-kind",
      importance: 0.5
    })) as { stored: boolean; kind?: string };
    expect(result.stored).toBe(true);
    expect(result.kind).toBe("fact");
  });

  it("uses the per-user registry when no LTM is bound", async () => {
    const memory = newMemory();
    setLongTermMemory("user-1", memory);
    const tool = new LtmRememberTool();
    const ctx = createMockContext();
    ctx.userId = "user-1";
    const result = (await tool.process(ctx, {
      text: "User prefers TypeScript"
    })) as { stored: boolean };
    expect(result.stored).toBe(true);
  });

  it("returns stored=false when LTM is unavailable", async () => {
    const tool = new LtmRememberTool();
    const ctx = createMockContext();
    ctx.userId = "no-such-user";
    const result = (await tool.process(ctx, {
      text: "hello"
    })) as { stored: boolean; note?: string };
    expect(result.stored).toBe(false);
    expect(result.note).toMatch(/not configured/);
  });
});

describe("ltm_recall", () => {
  it("returns relevant items via the bound LTM", async () => {
    const memory = newMemory();
    await memory.remember("User prefers TypeScript", { kind: "preference" });
    const tool = new LtmRecallTool(memory);
    const ctx = createMockContext();
    const result = (await tool.process(ctx, {
      query: "user language preference"
    })) as { items: Array<{ text: string; kind: string }> };
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0].text).toMatch(/TypeScript/);
  });

  it("clamps k to the [1, 20] range", async () => {
    const memory = newMemory();
    for (let i = 0; i < 25; i++) {
      await memory.remember(`note ${i}`, {
        kind: "fact",
        skipDedupe: true
      });
    }
    const tool = new LtmRecallTool(memory);
    const ctx = createMockContext();
    const result = (await tool.process(ctx, {
      query: "note",
      k: 100
    })) as { items: unknown[] };
    expect(result.items.length).toBeLessThanOrEqual(20);
  });
});

describe("registry helpers", () => {
  it("LTM_TOOL_NAMES exposes the canonical names", () => {
    expect(LTM_TOOL_NAMES).toEqual(["ltm_recall", "ltm_remember"]);
  });

  it("setLongTermMemory(userId, null) clears the registry", () => {
    const memory = newMemory();
    setLongTermMemory("user-1", memory);
    expect(getLongTermMemory("user-1")).toBe(memory);
    setLongTermMemory("user-1", null);
    expect(getLongTermMemory("user-1")).toBeNull();
  });
});
