import { describe, expect, it, vi } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import type { BaseProvider } from "@nodetool-ai/runtime";
import type { Message } from "@nodetool-ai/protocol";
import {
  critiqueImage,
  compareImages,
  scoreImageAdherence
} from "../src/capabilities/media.js";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";

const questions = ["One product?", "Readable label?", "Blue cap?"];
const png = createCanvas(2, 2).toBuffer("image/png");
const valid = "asset://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png";
const missing = "asset://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.png";

async function setup(reply: unknown, bytes: Uint8Array = png) {
  const storage = new InMemoryStorageAdapter();
  await storage.store("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png", bytes);
  const context = new ProcessingContext({
    jobId: "judge-evidence",
    userId: "u1",
    storage,
    fetchFn: async () => new Response(null, { status: 404 })
  });
  const providerCall = vi.fn(
    async (_request: { messages: Message[] }): Promise<Message> => ({
      role: "assistant",
      content: JSON.stringify(reply)
    })
  );
  // Only the provider-facing judge method is scripted. URI resolution remains real.
  vi.spyOn(context, "getProvider").mockResolvedValue({
    generateMessageTraced: providerCall
  } as unknown as BaseProvider);
  const run = createCapabilityRun({ context, gate: UNGATED });
  return { context, run, providerCall };
}

function answer(id: string, question: string, value = "yes") {
  return { id, question, answer: value, note: "" };
}
const complete = questions.map((q, i) => answer(`q${i + 1}`, q));
const params = {
  provider: "fake",
  model: "vision",
  image: valid,
  brief: "product",
  questions
};

describe("adherence evidence coverage", () => {
  it.each([
    ["missing", [complete[0]], ["q2", "q3"], ""],
    [
      "duplicate",
      [complete[0], complete[0], complete[0]],
      ["q2", "q3"],
      "duplicate check: q1"
    ],
    [
      "substituted",
      [complete[0], complete[1], answer("q3", "Unrequested?")],
      ["q3"],
      "unrequested or substituted check: q3"
    ],
    [
      "unknown identity",
      [complete[0], complete[1], answer("q9", questions[2])],
      ["q3"],
      "unrequested or substituted check: q9"
    ]
  ])("rejects %s evidence", async (_name, answers, missingIds, invalid) => {
    const { run } = await setup({ answers });
    const result = await scoreImageAdherence.impl(run, params);
    expect(result).toMatchObject({
      evidence_status: "invalid",
      total: 3,
      missing_ids: missingIds
    });
    if (invalid)
      expect(result).toHaveProperty(
        "invalid",
        expect.arrayContaining([invalid])
      );
    expect(result).not.toHaveProperty("score");
    expect(result).toHaveProperty("error");
  });

  it.each([false, true])(
    "scores complete reordered evidence, mixed=%s",
    async (mixed) => {
      const answers = [...complete]
        .reverse()
        .map((a) => (mixed && a.id === "q2" ? { ...a, answer: "no" } : a));
      const { run } = await setup({ answers });
      const result = await scoreImageAdherence.impl(run, params);
      expect(result).toMatchObject({
        total: 3,
        passed: mixed ? 2 : 3,
        evidence_status: "complete",
        answers: mixed
          ? [complete[0], { ...complete[1], answer: "no" }, complete[2]]
          : complete
      });
      expect(result).toHaveProperty("score", mixed ? 2 / 3 : 1);
    }
  );
});

describe("required image evidence", () => {
  it.each([critiqueImage, scoreImageAdherence])(
    "refuses absent evidence for $spec.name before a provider call",
    async (capability) => {
      const { run, providerCall } = await setup({
        verdict: "pass",
        answers: complete
      });
      const result = await capability.impl(run, { ...params, image: missing });
      expect(result).toHaveProperty("error");
      expect(JSON.stringify(result)).toContain(missing);
      expect(providerCall).not.toHaveBeenCalled();
    }
  );
  it("refuses missing adherence evidence before decomposition", async () => {
    const { run, providerCall } = await setup({ questions });
    expect(
      await scoreImageAdherence.impl(run, {
        ...params,
        image: missing,
        questions: []
      })
    ).toHaveProperty("error");
    expect(providerCall).not.toHaveBeenCalled();
  });
  it("preserves both decoded comparison images on every provider call", async () => {
    const { run, providerCall } = await setup({ winner: 1, reason: "first" });
    const inline = `data:image/png;base64,${png.toString("base64")}`;
    expect(
      await compareImages.impl(run, { ...params, images: [valid, inline] })
    ).toHaveProperty("type", "comparison");
    for (const [request] of providerCall.mock.calls) {
      const content = request.messages[0].content;
      if (!Array.isArray(content)) throw new Error("Expected content blocks");
      expect(content.filter((part) => part.type === "image_url")).toHaveLength(
        2
      );
      expect(JSON.stringify(content)).toContain(valid);
    }
  });
  it("preflights the entire comparison candidate set", async () => {
    const { run, providerCall } = await setup({ winner: 1 });
    const result = await compareImages.impl(run, {
      ...params,
      images: [valid, valid, missing]
    });
    expect(result).toHaveProperty("error");
    expect(providerCall).not.toHaveBeenCalled();
  });
  it.each([new Uint8Array(), new Uint8Array([1, 2, 3]), png.subarray(0, 40)])(
    "rejects empty, unsupported, or corrupt bytes",
    async (bytes) => {
      const { run, providerCall } = await setup({ verdict: "pass" }, bytes);
      expect(await critiqueImage.impl(run, params)).toHaveProperty("error");
      expect(providerCall).not.toHaveBeenCalled();
    }
  );
  it("dispatches decoded PNG evidence with its identity and actual MIME", async () => {
    const { run, providerCall } = await setup({
      verdict: "pass",
      defects: [],
      strengths: []
    });
    expect(await critiqueImage.impl(run, params)).toHaveProperty(
      "verdict",
      "pass"
    );
    const request = providerCall.mock.calls[0]?.[0];
    if (!request) throw new Error("Expected provider call");
    const content = request.messages[0].content;
    expect(Array.isArray(content)).toBe(true);
    if (!Array.isArray(content)) throw new Error("Expected content blocks");
    expect(content.filter((p) => p.type === "image_url")).toEqual([
      {
        type: "image_url",
        image: {
          uri: `data:image/png;base64,${png.toString("base64")}`,
          mimeType: "image/png"
        }
      }
    ]);
    expect(JSON.stringify(content)).toContain(valid);
  });
  it("keeps missing historical chat attachments tolerant", async () => {
    const { context, providerCall } = await setup({});
    await context.runProviderPrediction({
      provider: "fake",
      model: "vision",
      capability: "generate_message",
      params: {
        messages: [
          {
            role: "user",
            content: [{ type: "image_url", image: { uri: missing } }]
          }
        ]
      }
    });
    expect(providerCall).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(providerCall.mock.calls)).toContain(
      "could not be shown"
    );
  });
});
