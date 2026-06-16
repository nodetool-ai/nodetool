/**
 * Tests for the opt-in LLM memory-synthesis pass on LongTermMemory.
 *
 * Synthesis runs AFTER the existing hybrid recall and distils recalled items
 * into <=7 standalone, cited facts. It is default-OFF and best-effort: a hiccup
 * degrades to raw recall and never breaks a run. These tests drive the
 * synthesis path through a fake provider, mirroring the extraction tests in
 * long-term-memory.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync } from "node:fs";

import {
  SqliteVecProvider,
  type EmbeddingFunction,
  type VectorProvider
} from "@nodetool-ai/vectorstore";
import type { BaseProvider, Message } from "@nodetool-ai/runtime";

import {
  LongTermMemory,
  createDefaultLongTermMemory
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

let provider: VectorProvider;
let dbPath: string;

beforeEach(() => {
  dbPath = join(
    tmpdir(),
    `ltm-synth-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
  );
  provider = new SqliteVecProvider({ dbPath });
});

afterEach(() => {
  try {
    provider.close();
  } catch {}
  for (const ext of ["", "-wal", "-shm"]) {
    try {
      unlinkSync(dbPath + ext);
    } catch {}
  }
});

interface MakeMemoryOpts {
  synthesizeRecall?: boolean;
  synthesisProvider?: BaseProvider | null;
  synthesisModel?: string;
  extractionProvider?: BaseProvider | null;
  extractionModel?: string | null;
}

function createMemory(opts: MakeMemoryOpts = {}): LongTermMemory {
  return new LongTermMemory({
    userId: "user-1",
    namespace: "synth-test",
    vectorProvider: provider,
    embeddingFunction: fakeEmbedder,
    synthesizeRecall: opts.synthesizeRecall,
    synthesisProvider: opts.synthesisProvider,
    synthesisModel: opts.synthesisModel,
    extractionProvider: opts.extractionProvider ?? null,
    extractionModel:
      opts.extractionModel === undefined
        ? undefined
        : (opts.extractionModel ?? undefined)
  });
}

/** Fake provider that returns a fixed content string for synthesis. */
function fakeProvider(content: string) {
  return {
    generateMessageTraced: vi.fn(async () => ({
      role: "assistant" as const,
      content
    }))
  } as unknown as BaseProvider & {
    generateMessageTraced: ReturnType<typeof vi.fn>;
  };
}

const SAMPLE_ITEMS = [
  {
    id: "i0",
    text: "User prefers TypeScript over JavaScript",
    kind: "preference" as const,
    importance: 0.8,
    source: "extraction",
    createdAt: 1,
    lastAccessedAt: 1,
    accessCount: 0
  },
  {
    id: "i1",
    text: "User runs tests with Vitest",
    kind: "fact" as const,
    importance: 0.5,
    source: "manual",
    createdAt: 1,
    lastAccessedAt: 1,
    accessCount: 0
  }
];

describe("LongTermMemory.synthesisEnabled", () => {
  it("is true by default (synthesizeRecall unset) when a provider is configured", () => {
    const mem = createMemory({
      synthesisProvider: fakeProvider("[]"),
      synthesisModel: "fake-model"
    });
    expect(mem.synthesisEnabled).toBe(true);
  });

  it("is false when explicitly disabled (synthesizeRecall=false) despite a provider", () => {
    const mem = createMemory({
      synthesizeRecall: false,
      synthesisProvider: fakeProvider("[]"),
      synthesisModel: "fake-model"
    });
    expect(mem.synthesisEnabled).toBe(false);
  });

  it("is false when synthesizeRecall=true but no synthesis/extraction provider+model resolve", () => {
    const mem = createMemory({ synthesizeRecall: true });
    expect(mem.synthesisEnabled).toBe(false);
  });

  it("is true when synthesizeRecall=true and a synthesisProvider+model are present", () => {
    const mem = createMemory({
      synthesizeRecall: true,
      synthesisProvider: fakeProvider("[]"),
      synthesisModel: "fake-model"
    });
    expect(mem.synthesisEnabled).toBe(true);
  });

  it("is true when synthesizeRecall=true and it falls back to extractionProvider/model", () => {
    const mem = createMemory({
      synthesizeRecall: true,
      extractionProvider: fakeProvider("[]"),
      extractionModel: "extract-model"
    });
    expect(mem.synthesisEnabled).toBe(true);
  });
});

describe("createDefaultLongTermMemory synthesis forwarding", () => {
  // Regression guard: the helper used to drop synthesizeRecall /
  // synthesisProvider / synthesisModel, so synthesis was unreachable through
  // the only production constructor — `synthesizeRecall: true` silently
  // degraded to raw recall everywhere. Forcing the embedding model via env
  // keeps the helper offline (no secret lookup, no network).
  // A real model prefix so the embedder resolver returns a (lazily-constructed,
  // never-called) embedding function and isReady() is true offline.
  const SAVED = process.env["NODETOOL_MEMORY_EMBEDDING_MODEL"];
  beforeEach(() => {
    process.env["NODETOOL_MEMORY_EMBEDDING_MODEL"] = "text-embedding-3-small";
  });
  afterEach(() => {
    if (SAVED === undefined) delete process.env["NODETOOL_MEMORY_EMBEDDING_MODEL"];
    else process.env["NODETOOL_MEMORY_EMBEDDING_MODEL"] = SAVED;
  });

  it("enables synthesis by default (synthesizeRecall unset) when a provider resolves", async () => {
    const mem = await createDefaultLongTermMemory({
      userId: "user-1",
      enabled: true,
      extractionProvider: fakeProvider("[]"),
      extractionModel: "extract-model"
    });
    expect(mem).not.toBeNull();
    expect(mem!.synthesisEnabled).toBe(true);
  });

  it("forwards synthesizeRecall=false so the helper can opt synthesis out", async () => {
    const mem = await createDefaultLongTermMemory({
      userId: "user-1",
      enabled: true,
      extractionProvider: fakeProvider("[]"),
      extractionModel: "extract-model",
      synthesizeRecall: false
    });
    expect(mem).not.toBeNull();
    expect(mem!.synthesisEnabled).toBe(false);
  });
});

describe("LongTermMemory.synthesize", () => {
  it("returns [] immediately when items is empty (no LLM call made)", async () => {
    const p = fakeProvider("[]");
    const mem = createMemory({
      synthesizeRecall: true,
      synthesisProvider: p,
      synthesisModel: "fake-model"
    });
    const facts = await mem.synthesize("anything", []);
    expect(facts).toEqual([]);
    expect((p as any).generateMessageTraced).not.toHaveBeenCalled();
  });

  it("returns [] when synthesisEnabled is false (no LLM call)", async () => {
    const p = fakeProvider("[]");
    // Explicitly opted out (default is on), so synthesize() short-circuits.
    const mem = createMemory({
      synthesizeRecall: false,
      synthesisProvider: p,
      synthesisModel: "fake-model"
    });
    const facts = await mem.synthesize("query", SAMPLE_ITEMS);
    expect(facts).toEqual([]);
    expect((p as any).generateMessageTraced).not.toHaveBeenCalled();
  });

  it("parses a JSON array from a fake provider into SynthesizedFact[]", async () => {
    const p = fakeProvider(
      JSON.stringify([
        {
          fact: "The user prefers TypeScript.",
          utility: "apply_preference",
          sources: [0]
        },
        {
          fact: "The user runs tests with Vitest.",
          utility: "maintain_continuity",
          sources: [1]
        }
      ])
    );
    const mem = createMemory({
      synthesizeRecall: true,
      synthesisProvider: p,
      synthesisModel: "fake-model"
    });
    const facts = await mem.synthesize("which test framework?", SAMPLE_ITEMS);
    expect(facts).toHaveLength(2);
    expect(facts[0].fact).toBe("The user prefers TypeScript.");
    expect(facts[0].utility).toBe("apply_preference");
    expect(facts[0].sources).toEqual([0]);
    expect(facts[1].sources).toEqual([1]);
  });

  it("hard-caps the result at 7 even when the provider returns 10 facts", async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      fact: `Fact number ${i}.`,
      utility: "maintain_continuity",
      sources: [0]
    }));
    const p = fakeProvider(JSON.stringify(many));
    const mem = createMemory({
      synthesizeRecall: true,
      synthesisProvider: p,
      synthesisModel: "fake-model"
    });
    const facts = await mem.synthesize("query", SAMPLE_ITEMS);
    expect(facts).toHaveLength(7);
  });

  it("tolerates JSON wrapped in code fences", async () => {
    const p = fakeProvider(
      "```json\n" +
        JSON.stringify([
          { fact: "The user uses Vitest.", utility: "apply_preference", sources: [1] }
        ]) +
        "\n```"
    );
    const mem = createMemory({
      synthesizeRecall: true,
      synthesisProvider: p,
      synthesisModel: "fake-model"
    });
    const facts = await mem.synthesize("query", SAMPLE_ITEMS);
    expect(facts).toHaveLength(1);
    expect(facts[0].fact).toBe("The user uses Vitest.");
    expect(facts[0].utility).toBe("apply_preference");
  });

  it("coerces an unknown utility value to the default enum member", async () => {
    const p = fakeProvider(
      JSON.stringify([
        { fact: "Something durable.", utility: "totally_made_up", sources: [0] }
      ])
    );
    const mem = createMemory({
      synthesizeRecall: true,
      synthesisProvider: p,
      synthesisModel: "fake-model"
    });
    const facts = await mem.synthesize("query", SAMPLE_ITEMS);
    expect(facts).toHaveLength(1);
    expect(facts[0].utility).toBe("maintain_continuity");
  });

  it("drops source indices that are out of the candidate range", async () => {
    const p = fakeProvider(
      JSON.stringify([
        { fact: "Cited beyond range.", utility: "avoid_re_asking", sources: [0, 2, 99, -1] }
      ])
    );
    const mem = createMemory({
      synthesizeRecall: true,
      synthesisProvider: p,
      synthesisModel: "fake-model"
    });
    // SAMPLE_ITEMS has 2 candidates -> valid indices are 0 and 1.
    const facts = await mem.synthesize("query", SAMPLE_ITEMS);
    expect(facts).toHaveLength(1);
    expect(facts[0].sources).toEqual([0]);
  });

  it("returns [] (best-effort) when the provider throws and does not reject", async () => {
    const warn = vi.fn();
    const throwing = {
      generateMessageTraced: vi.fn(async () => {
        throw new Error("boom");
      })
    } as unknown as BaseProvider;
    const mem = createMemory({
      synthesizeRecall: true,
      synthesisProvider: throwing,
      synthesisModel: "fake-model"
    });
    void warn;
    const facts = await mem.synthesize("query", SAMPLE_ITEMS);
    expect(facts).toEqual([]);
  });

  it("returns [] when the model emits non-JSON noise", async () => {
    const p = fakeProvider("I cannot synthesize anything useful here.");
    const mem = createMemory({
      synthesizeRecall: true,
      synthesisProvider: p,
      synthesisModel: "fake-model"
    });
    const facts = await mem.synthesize("query", SAMPLE_ITEMS);
    expect(facts).toEqual([]);
  });

  it("sends the query and each candidate with its 0-based index, kind, and source", async () => {
    let capturedUser = "";
    const p = {
      generateMessageTraced: vi.fn(async (args: { messages: Message[] }) => {
        const userMsg = args.messages.find((m) => m.role === "user");
        capturedUser = typeof userMsg?.content === "string" ? userMsg.content : "";
        return { role: "assistant" as const, content: "[]" };
      })
    } as unknown as BaseProvider;
    const mem = createMemory({
      synthesizeRecall: true,
      synthesisProvider: p,
      synthesisModel: "fake-model"
    });
    await mem.synthesize("Which test framework does the user use?", SAMPLE_ITEMS);

    expect(capturedUser).toContain("Which test framework does the user use?");
    // Candidate [0]: preference, source extraction
    expect(capturedUser).toContain("[0]");
    expect(capturedUser).toContain("preference");
    expect(capturedUser).toContain("source: extraction");
    expect(capturedUser).toContain("User prefers TypeScript over JavaScript");
    // Candidate [1]: fact, source manual
    expect(capturedUser).toContain("[1]");
    expect(capturedUser).toContain("source: manual");
    expect(capturedUser).toContain("User runs tests with Vitest");
  });

  it("only includes recalled item texts as candidates — no tool/system memory text", async () => {
    let capturedUser = "";
    const p = {
      generateMessageTraced: vi.fn(async (args: { messages: Message[] }) => {
        const userMsg = args.messages.find((m) => m.role === "user");
        capturedUser = typeof userMsg?.content === "string" ? userMsg.content : "";
        return { role: "assistant" as const, content: "[]" };
      })
    } as unknown as BaseProvider;
    const mem = createMemory({
      synthesizeRecall: true,
      synthesisProvider: p,
      synthesisModel: "fake-model"
    });
    // Candidates come from recall(), which only ever returns stored items.
    await mem.synthesize("query", SAMPLE_ITEMS);
    expect(capturedUser).not.toContain("API_KEY");
    expect(capturedUser).not.toContain("system:");
    expect(capturedUser).not.toContain("tool:");
  });
});

describe("LongTermMemory.recallSynthesized", () => {
  it("returns { items, facts } — items equals recall() output, facts is synthesis output", async () => {
    const p = fakeProvider(
      JSON.stringify([
        { fact: "The user uses Vitest.", utility: "apply_preference", sources: [0] }
      ])
    );
    const mem = createMemory({
      synthesizeRecall: true,
      synthesisProvider: p,
      synthesisModel: "fake-model"
    });
    await mem.remember("User runs tests with Vitest", { kind: "fact" });

    const recalled = await mem.recall("vitest");
    const { items, facts } = await mem.recallSynthesized("vitest");

    expect(items.map((i) => i.text)).toEqual(recalled.map((i) => i.text));
    expect(facts).toHaveLength(1);
    expect(facts[0].fact).toBe("The user uses Vitest.");
  });

  it("returns empty facts but full items when synthesisEnabled is false (degrades gracefully)", async () => {
    const p = fakeProvider("[]");
    // Explicitly opted out (default is on) -> synthesisEnabled false
    const mem = createMemory({
      synthesizeRecall: false,
      synthesisProvider: p,
      synthesisModel: "fake-model"
    });
    await mem.remember("User runs tests with Vitest", { kind: "fact" });

    const { items, facts } = await mem.recallSynthesized("vitest");
    expect(items.length).toBeGreaterThan(0);
    expect(facts).toEqual([]);
    expect((p as any).generateMessageTraced).not.toHaveBeenCalled();
  });
});
