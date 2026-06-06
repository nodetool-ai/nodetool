import { describe, expect, it } from "vitest";
import { MinimaxVoiceNode } from "../src/nodes/voice.js";
import { DEFAULT_VOICE, MINIMAX_VOICES } from "../src/minimax-base.js";

function makeNode(props: Record<string, unknown> = {}): MinimaxVoiceNode {
  return new MinimaxVoiceNode(props);
}

describe("MinimaxVoiceNode", () => {
  it("outputs the selected voice ID", async () => {
    const node = makeNode({ voice: "English_CalmWoman" });
    const result = await node.process();
    expect(result.voice_id).toBe("English_CalmWoman");
  });

  it("defaults to the trustworthy man voice", async () => {
    const result = await makeNode().process();
    expect(result.voice_id).toBe(DEFAULT_VOICE);
  });

  it("exposes every system voice as an enum option", () => {
    const voiceProp = MinimaxVoiceNode.getDeclaredProperties().find(
      (p) => p.name === "voice"
    );
    expect(voiceProp?.options.values).toEqual(MINIMAX_VOICES);
  });

  it("declares a string voice_id output", () => {
    expect(MinimaxVoiceNode.metadataOutputTypes).toEqual({ voice_id: "str" });
  });
});
