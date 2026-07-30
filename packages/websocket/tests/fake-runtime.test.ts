import { describe, expect, it } from "vitest";

import {
  FakeProvider,
  assertValidFakeChunk,
  fakeExecutor,
  FAKE_LLM_TEXT
} from "../src/fake-runtime.js";

describe("fake-runtime conformance gate (RELIABILITY_TASKS.md Track E, E3)", () => {
  describe("assertValidFakeChunk", () => {
    it("accepts a well-formed Chunk", () => {
      expect(() =>
        assertValidFakeChunk({
          type: "chunk",
          content: "hello",
          done: true,
          content_type: "text"
        })
      ).not.toThrow();
    });

    it("throws a descriptive error on a Chunk missing required 'content'", () => {
      expect(() =>
        assertValidFakeChunk({ type: "chunk", done: true })
      ).toThrow(/fails processingMessageSchemas\.chunk/);
    });

    it("throws when 'content' has the wrong type", () => {
      expect(() =>
        assertValidFakeChunk({ type: "chunk", content: 12345 })
      ).toThrow(/fails processingMessageSchemas\.chunk/);
    });
  });

  describe("FakeProvider", () => {
    it("yields only chunks that pass the B1 chunk schema", async () => {
      const provider = new FakeProvider();
      const items: unknown[] = [];
      for await (const item of provider.generateMessages({
        messages: [{ role: "user", content: "hi" }],
        model: "fake-model"
      })) {
        items.push(item);
      }
      const chunks = items.filter(
        (i) => typeof i === "object" && i !== null && (i as { type?: unknown }).type === "chunk"
      );
      expect(chunks.length).toBeGreaterThan(0);
      for (const chunk of chunks) {
        expect(() => assertValidFakeChunk(chunk)).not.toThrow();
      }
      // Sanity: the default script (no tools available) falls back to the
      // deterministic text chunk.
      expect((chunks[0] as { content?: string }).content).toBe(FAKE_LLM_TEXT);
    });
  });

  describe("fakeExecutor", () => {
    it("produces type-correct placeholder outputs for declared slots", async () => {
      const executor = fakeExecutor({
        outputs: [
          { name: "text", type: { type: "str" } },
          { name: "img", type: { type: "image" } }
        ]
      });
      const result = await executor.process({});
      expect(result.text).toBe("deterministic e2e output");
      expect(result.img).toMatchObject({ type: "image" });
    });
  });
});
