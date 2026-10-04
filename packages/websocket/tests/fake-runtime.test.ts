import { describe, expect, it } from "vitest";
import { DirectorNode } from "@nodetool-ai/base-nodes";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import { ProcessingContext } from "@nodetool-ai/runtime";

import {
  FakeProvider,
  assertValidFakeChunk,
  createFakeExecutorResolver,
  fakeExecutor,
  FAKE_LLM_TEXT
} from "../src/fake-runtime.js";

describe("fake-runtime conformance gate (RELIABILITY_TASKS.md Track E, E3)", () => {
  describe("createFakeExecutorResolver", () => {
    it.each([
      undefined,
      { type: "language_model", provider: "", id: "", name: "" },
      {
        type: "language_model",
        provider: "selected",
        id: "selected-model",
        name: "Selected"
      }
    ])("runs a Director with the host's fake provider (%j)", async (model) => {
      const registry = new NodeRegistry();
      registry.register(DirectorNode);
      const context = new ProcessingContext({ jobId: "fake-director" });
      const resolvedProviders: string[] = [];
      context.setProviderResolver(async (providerId) => {
        resolvedProviders.push(providerId);
        return new FakeProvider();
      });
      const properties = {
        ...(model ? { model } : {}),
        brief: "A lighthouse keeper's last night",
        shot_count: 3
      };
      const executor = createFakeExecutorResolver(() => registry)({
        id: "director",
        type: DirectorNode.nodeType,
        properties
      });

      const result = await executor.process({}, context);

      expect(result.screenplay).toMatchObject({
        type: "screenplay",
        shots: [
          { index: 0, action: "A lighthouse keeper's last night — beat 1 of 3" },
          { index: 1, action: "A lighthouse keeper's last night — beat 2 of 3" },
          { index: 2, action: "A lighthouse keeper's last night — beat 3 of 3" }
        ]
      });
      expect(properties).toEqual({
        ...(model ? { model } : {}),
        brief: "A lighthouse keeper's last night",
        shot_count: 3
      });
      expect(resolvedProviders).toEqual([model?.provider || "openai"]);
    });
  });

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

    it("returns deterministic word and segment timestamps for Transcribe", async () => {
      const executor = fakeExecutor(
        {
          node_type: "openai.audio.Transcribe",
          outputs: [
            { name: "text", type: { type: "str" } },
            { name: "words", type: { type: "list" } },
            { name: "segments", type: { type: "list" } }
          ]
        }
      );

      const result = await executor.process({ timestamps: true });

      expect(result.text).toBe("deterministic e2e response");
      expect(result.words).toEqual([
        { text: "deterministic", timestamp: [0, 1] },
        { text: "e2e", timestamp: [1, 2] },
        { text: "response", timestamp: [2, 3] }
      ]);
      expect(result.segments).toEqual([
        { text: "deterministic e2e response", timestamp: [0, 3] }
      ]);
    });

    it("keeps Transcribe lists empty when timestamps are disabled", async () => {
      const executor = fakeExecutor(
        {
          node_type: "openai.audio.Transcribe",
          outputs: [
            { name: "text", type: { type: "str" } },
            { name: "words", type: { type: "list" } },
            { name: "segments", type: { type: "list" } }
          ]
        }
      );

      await expect(executor.process({ timestamps: false })).resolves.toEqual({
        text: "deterministic e2e response",
        words: [],
        segments: []
      });
    });

    it("honors timestamp properties saved on the node descriptor", async () => {
      const executor = fakeExecutor(
        {
          node_type: "openai.audio.Transcribe",
          outputs: [
            { name: "text", type: { type: "str" } },
            { name: "words", type: { type: "list" } },
            { name: "segments", type: { type: "list" } }
          ]
        },
        "openai.audio.Transcribe",
        { timestamps: true }
      );

      const result = await executor.process({});

      expect(result.words).toEqual([
        { text: "deterministic", timestamp: [0, 1] },
        { text: "e2e", timestamp: [1, 2] },
        { text: "response", timestamp: [2, 3] }
      ]);
      expect(result.segments).toEqual([
        { text: "deterministic e2e response", timestamp: [0, 3] }
      ]);
    });
  });
});
