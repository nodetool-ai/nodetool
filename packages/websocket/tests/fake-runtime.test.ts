import { describe, expect, it } from "vitest";
import { AgentNode, DirectorNode } from "@nodetool-ai/base-nodes";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  ProcessingContext,
  generateStructured,
  getRegisteredProvider,
  isProviderConfigured,
  registerProvider,
  unregisterProvider
} from "@nodetool-ai/runtime";

import {
  FAKE_IMAGE_PNG_BASE64,
  FakeProvider,
  assertValidFakeChunk,
  fakeAllProviders,
  createFakeExecutorResolver,
  fakeExecutor,
  FAKE_LLM_TEXT
} from "../src/fake-runtime.js";
import {
  PLAN_CODE_NODE_TYPE,
  WORKFLOW_PLAN_TOOL_NAME,
  buildWorkflowPlanSchema,
  parseWorkflowPlan
} from "@nodetool-ai/protocol";
import { plannedCodeStepProblems } from "@nodetool-ai/node-sdk/code-analysis";

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

      // The actor passes saved properties again as execution inputs.
      const result = await executor.process(properties, context);

      // The fake answers the Director's forced screenplay tool with values
      // its schema accepts, as a real model must.
      expect(result.screenplay).toMatchObject({
        type: "screenplay",
        shots: [
          { index: 0, action: "fake" },
          { index: 1, action: "fake" },
          { index: 2, action: "fake" }
        ]
      });
      const streamed: Record<string, unknown>[] = [];
      for await (const output of executor.genProcess!(properties, context)) {
        streamed.push(output);
      }
      expect(streamed).toEqual([result]);
      expect(properties).toEqual({
        ...(model ? { model } : {}),
        brief: "A lighthouse keeper's last night",
        shot_count: 3
      });
      expect(resolvedProviders).toEqual([model?.provider || "openai"]);
    });
    it("runs an Agent with the host's fake provider instead of faking its media slots", async () => {
      const registry = new NodeRegistry();
      registry.register(AgentNode);
      const context = new ProcessingContext({ jobId: "fake-agent" });
      context.setProviderResolver(async () => new FakeProvider());
      const properties = { prompt: "Rewrite: the fox jumps." };
      const executor = createFakeExecutorResolver(() => registry)({
        id: "agent",
        type: AgentNode.nodeType,
        properties
      });

      const outputs: Record<string, unknown>[] = [];
      if (executor.genProcess) {
        for await (const output of executor.genProcess(properties, context)) {
          outputs.push(output);
        }
      } else {
        outputs.push(await executor.process(properties, context));
      }

      // The Agent accepts optional image and audio inputs and declares an
      // audio output. A text run must answer with text, not a placeholder
      // audio clip in every media slot.
      expect(outputs.some((o) => o.text === FAKE_LLM_TEXT)).toBe(true);
      expect(outputs.every((o) => o.audio == null)).toBe(true);
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

describe("FakeProvider as a stand-in provider", () => {
  it("answers a forced tool with arguments its schema accepts", async () => {
    const provider = new FakeProvider();
    const data = await generateStructured(provider, {
      messages: [{ role: "user", content: "A fox in snow" }],
      model: "test-chat-model",
      toolName: "refine_brief",
      toolDescription: "Return the brief.",
      schema: {
        type: "object",
        properties: {
          subject: { type: "string" },
          aspect: { type: "string", enum: ["square", "wide"] }
        },
        required: ["subject", "aspect"]
      }
    });
    expect(data).toEqual({ subject: "fake", aspect: "square" });
  });

  it("answers the workflow planner with a plan that builds and runs", async () => {
    const provider = new FakeProvider();
    const calls: unknown[] = [];
    for await (const item of provider.generateMessages({
      messages: [{ role: "user", content: "Change a sentence I type." }],
      model: "fake-model",
      tools: [
        {
          name: WORKFLOW_PLAN_TOOL_NAME,
          description: "plan",
          inputSchema: buildWorkflowPlanSchema()
        }
      ],
      toolChoice: WORKFLOW_PLAN_TOOL_NAME
    })) {
      calls.push(item);
    }

    const plan = parseWorkflowPlan((calls[0] as { args: unknown }).args);
    expect(plan?.steps).toHaveLength(1);
    const step = plan!.steps[0];
    expect(step.node_type).toBe(PLAN_CODE_NODE_TYPE);
    expect(
      plannedCodeStepProblems(step.code!, { inputs: ["input"], output: "output" })
    ).toEqual([]);
  });

  it("lists models only for the providers in its catalog", async () => {
    expect(await new FakeProvider({}, "openai").getAvailableLanguageModels()).toEqual([
      { id: "test-chat-model", name: "Test Chat Model", provider: "openai" }
    ]);
    expect(await new FakeProvider({}, "openai").getAvailableImageModels()).toMatchObject([
      { id: "test-image-model", provider: "openai" }
    ]);
    expect(await new FakeProvider({}, "groq").getAvailableLanguageModels()).toEqual([]);
    expect(new FakeProvider({}, "openai").getCapabilities()).toContain("text_to_image");
    expect(new FakeProvider({}, "anthropic").getCapabilities()).not.toContain("text_to_image");
  });

  it("returns a visible PNG for an image", async () => {
    const bytes = await new FakeProvider().textToImage({
      prompt: "A fox",
      model: { id: "test-image-model", name: "Test Image Model", provider: "openai" }
    } as Parameters<FakeProvider["textToImage"]>[0]);
    const png = Buffer.from(bytes);
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    // IHDR width and height: 256 × 256, not a 1 × 1 transparent pixel.
    expect(png.readUInt32BE(16)).toBe(256);
    expect(png.readUInt32BE(20)).toBe(256);
    expect(png.toString("base64")).toBe(FAKE_IMAGE_PNG_BASE64);
  });

  it("keeps credential keys only when asked to", async () => {
    registerProvider("qa-test-provider", FakeProvider, { api_key: "" }, {}, {
      access: "remote_api",
      displayName: "QA Test"
    });
    const noSecret = async (): Promise<string | null> => null;

    fakeAllProviders({ requireCredentials: true });
    expect(await isProviderConfigured("qa-test-provider", noSecret)).toBe(false);
    expect(getRegisteredProvider("qa-test-provider")?.metadata.displayName).toBe("QA Test");

    registerProvider("qa-test-provider", FakeProvider, { api_key: "" });
    fakeAllProviders();
    expect(await isProviderConfigured("qa-test-provider", noSecret)).toBe(true);
    unregisterProvider("qa-test-provider");
  });
});
