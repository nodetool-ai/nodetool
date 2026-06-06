import { describe, expect, it } from "vitest";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import { MINIMAX_NODES, registerMinimaxNodes } from "../src/index.js";

describe("registerMinimaxNodes", () => {
  it("registers the MiniMax node pack", () => {
    const registry = new NodeRegistry();
    registerMinimaxNodes(registry);

    expect(registry.has("minimax.Voice")).toBe(true);
    expect(registry.has("minimax.TextToSpeech")).toBe(true);
    expect(registry.has("minimax.MusicGeneration")).toBe(true);
    expect(registry.has("minimax.TextToImage")).toBe(true);
    expect(registry.has("minimax.TextToVideo")).toBe(true);
    expect(registry.has("minimax.ImageToVideo")).toBe(true);
  });

  it("exposes every node through MINIMAX_NODES", () => {
    const types = MINIMAX_NODES.map(
      (n) => (n as unknown as { nodeType: string }).nodeType
    );
    expect(types).toEqual([
      "minimax.Voice",
      "minimax.TextToSpeech",
      "minimax.MusicGeneration",
      "minimax.TextToImage",
      "minimax.TextToVideo",
      "minimax.ImageToVideo"
    ]);
  });
});
