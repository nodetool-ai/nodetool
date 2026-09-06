/**
 * A generator node fed a library-picked image ref (`asset_id` set, `uri`
 * empty) dropped the image: `generators.ts` carried a private
 * `normalizeBinaryRef` without the `asset_id -> asset://<id>` fallback that
 * `agent-utils.ts` has, and a private `buildMessageContent` that emitted
 * `{ type: "image" }` while every provider reads `{ type: "image_url" }`.
 *
 * These tests pin both: the image reaches the provider call, as the part shape
 * `MessageImageContent` declares.
 */

import { describe, it, expect, vi } from "vitest";
import {
  SVGGeneratorNode,
  StructuredOutputGeneratorNode
} from "../src/nodes/generators.js";
import type { ProcessingContext } from "@nodetool-ai/runtime";

const MODEL = "gpt-4o-mini";

function createContext(content: string) {
  const runProviderPrediction = vi.fn(async () => ({ content }));
  const context = {
    getProvider: async () => ({
      provider: "openai",
      cost: 0,
      usageTotals: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 }
    }),
    runProviderPrediction,
    // eslint-disable-next-line require-yield
    streamProviderPrediction: async function* () {},
    get: <T,>(_key: string, defaultValue?: T) => defaultValue as T
  } as unknown as ProcessingContext;
  return { context, runProviderPrediction };
}

type Part = { type: string; image?: { uri?: string }; audio?: { uri?: string } };

function userParts(call: unknown): Part[] {
  const request = call as {
    params: { messages: Array<{ role: string; content: unknown }> };
  };
  const user = request.params.messages.find((m) => m.role === "user");
  expect(Array.isArray(user?.content)).toBe(true);
  return user?.content as Part[];
}

describe("generator node media refs", () => {
  it("sends an asset_id-only image ref to the provider as asset://<id>", async () => {
    const { context, runProviderPrediction } = createContext(
      '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
    );
    const node = new SVGGeneratorNode();
    node.assign({
      prompt: "a red circle",
      model: { provider: "openai", id: MODEL },
      image: { type: "image", uri: "", asset_id: "asset-123", data: null }
    });

    await node.process(context);

    const parts = userParts(runProviderPrediction.mock.calls[0]?.[0]);
    expect(parts).toContainEqual({
      type: "image_url",
      image: { uri: "asset://asset-123" }
    });
  });

  it("keeps a list of image refs and a lone audio ref", async () => {
    const { context, runProviderPrediction } = createContext("<svg></svg>");
    const node = new SVGGeneratorNode();
    node.assign({
      prompt: "two pictures",
      model: { provider: "openai", id: MODEL },
      image: [
        { type: "image", uri: "https://example.com/a.png" },
        { type: "image", uri: "", asset_id: "asset-b" }
      ],
      audio: { type: "audio", uri: "", asset_id: "asset-c" }
    });

    await node.process(context);

    const parts = userParts(runProviderPrediction.mock.calls[0]?.[0]);
    expect(parts.filter((p) => p.type === "image_url").map((p) => p.image?.uri)).toEqual([
      "https://example.com/a.png",
      "asset://asset-b"
    ]);
    expect(parts.filter((p) => p.type === "audio").map((p) => p.audio?.uri)).toEqual([
      "asset://asset-c"
    ]);
  });

  it("sends the structured-output generator's image ref through its call", async () => {
    const { context, runProviderPrediction } = createContext('{"a":1}');
    const node = new StructuredOutputGeneratorNode();
    node.assign({
      instructions: "make a table",
      model: { provider: "openai", id: MODEL },
      image: { type: "image", uri: "", asset_id: "asset-d" }
    });
    (node as unknown as { _dynamic_outputs: Record<string, unknown> })._dynamic_outputs =
      { a: { type: "int" } };

    await node.process(context);

    const parts = userParts(runProviderPrediction.mock.calls[0]?.[0]);
    expect(parts).toContainEqual({
      type: "image_url",
      image: { uri: "asset://asset-d" }
    });
  });
});
