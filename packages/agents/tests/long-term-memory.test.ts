/**
 * Tests for LongTermMemory — covers store/recall ranking, dedupe, recency
 * weighting, and best-effort extraction via a fake provider.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync } from "node:fs";

import {
  SqliteVecStore,
  SqliteVecProvider,
  type EmbeddingFunction
} from "@nodetool-ai/vectorstore";
import type { BaseProvider, Message } from "@nodetool-ai/runtime";

import {
  LongTermMemory,
  formatMemoryForPrompt
} from "../src/long-term-memory.js";

// Deterministic 8-dim embedding: bag-of-words over a tiny vocabulary.
const VOCAB = [
  "typescript",
  "javascript",
  "python",
  "test",
  "vitest",
  "nodetool",
  "user",
  "memory"
];

const fakeEmbedder: EmbeddingFunction = {
  generate: async (texts) =>
    texts.map((t) => {
      const lower = t.toLowerCase();
      const vec = VOCAB.map((w) => (lower.includes(w) ? 1 : 0));
      const n = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1;
      return vec.map((x) => x / n);
    })
};

let store: SqliteVecStore;
let provider: SqliteVecProvider;
let dbPath: string;

beforeEach(() => {
  dbPath = join(
    tmpdir(),
    `ltm-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
  );
  store = new SqliteVecStore(dbPath);
  provider = new SqliteVecProvider({ store });
});

afterEach(() => {
  try {
    store.close();
  } catch {}
  for (const ext of ["", "-wal", "-shm"]) {
    try {
      unlinkSync(dbPath + ext);
    } catch {}
  }
});

function createMemory(
  opts: {
    extractionProvider?: BaseProvider | null;
    extractionModel?: string;
    dedupeSimilarity?: number;
  } = {}
): LongTermMemory {
  return new LongTermMemory({
    userId: "user-1",
    namespace: "test",
    vectorProvider: provider,
    embeddingFunction: fakeEmbedder,
    extractionProvider: opts.extractionProvider ?? null,
    extractionModel: opts.extractionModel ?? "fake-model",
    dedupeSimilarity: opts.dedupeSimilarity
  });
}

describe("LongTermMemory.remember + recall", () => {
  it("isReady() reflects whether an embedding function is configured", () => {
    const ready = createMemory();
    expect(ready.isReady()).toBe(true);

    const notReady = new LongTermMemory({
      userId: "user-1",
      vectorProvider: provider
    });
    expect(notReady.isReady()).toBe(false);
  });

  it("stores items and retrieves the most semantically relevant one", async () => {
    const mem = createMemory();
    await mem.remember("User prefers TypeScript over JavaScript", {
      kind: "preference",
      importance: 0.8
    });
    await mem.remember("User uses Python for data analysis", {
      kind: "preference",
      importance: 0.6
    });
    await mem.remember("User runs tests with Vitest", {
      kind: "fact",
      importance: 0.5
    });

    const hits = await mem.recall("Which testing framework does the user use?");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].text).toMatch(/Vitest/);
    expect(hits[0].score).toBeGreaterThan(0);
    expect(hits[0].kind).toBe("fact");
  });

  it("respects k", async () => {
    const mem = createMemory();
    // skipDedupe so the fake (vocabulary-only) embedder doesn't collapse
    // these into a single item — what we're testing is k-truncation, not
    // dedupe.
    for (let i = 0; i < 6; i++) {
      await mem.remember(`User prefers TypeScript fact number ${i}`, {
        kind: "fact",
        skipDedupe: true
      });
    }
    const hits = await mem.recall("typescript", { k: 2 });
    expect(hits.length).toBe(2);
  });

  it("skips near-duplicates when dedupe is enabled", async () => {
    const mem = createMemory({ dedupeSimilarity: 0.5 });
    const a = await mem.remember("User prefers TypeScript", {
      kind: "preference"
    });
    const b = await mem.remember("User prefers TypeScript", {
      kind: "preference"
    });
    expect(a).not.toBeNull();
    expect(b).toBeNull();
    const all = await mem.list();
    expect(all.length).toBe(1);
  });

  it("can store duplicates when skipDedupe is set", async () => {
    const mem = createMemory({ dedupeSimilarity: 0.5 });
    const a = await mem.remember("User prefers TypeScript", {
      kind: "preference"
    });
    const b = await mem.remember("User prefers TypeScript", {
      kind: "preference",
      skipDedupe: true
    });
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    const all = await mem.list();
    expect(all.length).toBe(2);
  });

  it("recall increments access count for returned items", async () => {
    const mem = createMemory();
    await mem.remember("User uses Vitest", { kind: "fact" });
    await mem.recall("vitest");
    await mem.recall("vitest");
    // bumpAccess is fire-and-forget; allow microtasks to flush.
    await new Promise((r) => setImmediate(r));
    const all = await mem.list();
    expect(all[0].accessCount).toBeGreaterThanOrEqual(1);
  });

  it("forget() removes a single item", async () => {
    const mem = createMemory();
    const a = await mem.remember("User prefers TypeScript", {
      kind: "preference"
    });
    await mem.remember("User uses Vitest", { kind: "fact" });
    expect((await mem.list()).length).toBe(2);
    await mem.forget(a!.id);
    expect((await mem.list()).length).toBe(1);
  });

  it("clear() drops the entire collection", async () => {
    const mem = createMemory();
    await mem.remember("a fact about TypeScript", { kind: "fact" });
    await mem.remember("a fact about Vitest", { kind: "fact" });
    await mem.clear();
    expect((await mem.list()).length).toBe(0);
  });
});

describe("LongTermMemory.rememberConversation", () => {
  it("returns 0 when no extraction provider is configured", async () => {
    const mem = createMemory({ extractionProvider: null });
    const stored = await mem.rememberConversation([
      { role: "user", content: "hi" } as Message,
      { role: "assistant", content: "hello" } as Message
    ]);
    expect(stored).toBe(0);
  });

  it("parses a JSON array from the extraction provider and stores items", async () => {
    const fakeProvider = {
      generateMessageTraced: vi.fn(async () => ({
        role: "assistant" as const,
        content: JSON.stringify([
          {
            text: "User prefers TypeScript over JavaScript",
            kind: "preference",
            importance: 0.8
          },
          {
            text: "User uses Vitest for testing",
            kind: "fact",
            importance: 0.7
          }
        ])
      }))
    };
    const mem = createMemory({
      extractionProvider: fakeProvider as unknown as BaseProvider
    });
    const stored = await mem.rememberConversation([
      {
        role: "user",
        content: "I love TypeScript and use Vitest"
      } as Message,
      { role: "assistant", content: "noted" } as Message
    ]);
    expect(stored).toBe(2);
    expect(fakeProvider.generateMessageTraced).toHaveBeenCalledTimes(1);
    const list = await mem.list();
    expect(list.map((i) => i.text).sort()).toEqual([
      "User prefers TypeScript over JavaScript",
      "User uses Vitest for testing"
    ]);
  });

  it("tolerates JSON wrapped in code fences", async () => {
    const fakeProvider = {
      generateMessageTraced: vi.fn(async () => ({
        role: "assistant" as const,
        content:
          "```json\n[{\"text\":\"User uses Vitest\",\"kind\":\"fact\",\"importance\":0.5}]\n```"
      }))
    };
    const mem = createMemory({
      extractionProvider: fakeProvider as unknown as BaseProvider
    });
    const stored = await mem.rememberConversation([
      { role: "user", content: "we use vitest" } as Message
    ]);
    expect(stored).toBe(1);
  });

  it("returns 0 when extraction throws", async () => {
    const fakeProvider = {
      generateMessageTraced: vi.fn(async () => {
        throw new Error("boom");
      })
    };
    const mem = createMemory({
      extractionProvider: fakeProvider as unknown as BaseProvider
    });
    const stored = await mem.rememberConversation([
      { role: "user", content: "hi" } as Message
    ]);
    expect(stored).toBe(0);
  });

  it("returns 0 when the model emits non-JSON noise", async () => {
    const fakeProvider = {
      generateMessageTraced: vi.fn(async () => ({
        role: "assistant" as const,
        content: "I cannot extract anything useful"
      }))
    };
    const mem = createMemory({
      extractionProvider: fakeProvider as unknown as BaseProvider
    });
    const stored = await mem.rememberConversation([
      { role: "user", content: "hi" } as Message
    ]);
    expect(stored).toBe(0);
  });
});

describe("formatMemoryForPrompt", () => {
  it("returns empty string for empty input", () => {
    expect(formatMemoryForPrompt([])).toBe("");
  });

  it("renders items with their kind tag", () => {
    const block = formatMemoryForPrompt([
      {
        id: "a",
        text: "User prefers TypeScript",
        kind: "preference",
        importance: 0.8,
        source: "test",
        createdAt: 1,
        lastAccessedAt: 1,
        accessCount: 0
      }
    ]);
    expect(block).toContain("[preference]");
    expect(block).toContain("User prefers TypeScript");
  });
});
