import { describe, expect, it } from "vitest";
import { StandardVoiceNode } from "../src/nodes/standard-voice.js";
import { VOICE_ID_MAP, VOICE_NAMES } from "../src/elevenlabs-base.js";

/** Helper: create a node with properties assigned. */
function makeNode(props: Record<string, unknown> = {}): StandardVoiceNode {
  return new StandardVoiceNode(props);
}

describe("StandardVoiceNode", () => {
  it("outputs the voice ID for the selected voice", async () => {
    const node = makeNode({ voice: "Aria" });
    const result = await node.process();

    expect(result.voice_id).toBe(VOICE_ID_MAP.Aria);
    expect(result.voice_id).toBe("9BWtsMINqrJLrRacOk9x");
  });

  it("resolves every standard voice to a non-empty ID", async () => {
    for (const name of VOICE_NAMES) {
      const node = makeNode({ voice: name });
      const result = await node.process();
      expect(result.voice_id).toBe(VOICE_ID_MAP[name]);
      expect(typeof result.voice_id).toBe("string");
      expect((result.voice_id as string).length).toBeGreaterThan(0);
    }
  });

  it("defaults to Aria when no voice is set", async () => {
    const node = makeNode();
    const result = await node.process();
    expect(result.voice_id).toBe(VOICE_ID_MAP.Aria);
  });

  it("throws when the voice is unknown", async () => {
    const node = makeNode({ voice: "NotARealVoice" });
    await expect(node.process()).rejects.toThrow("Unknown voice");
  });

  it("exposes every standard voice as an enum option", () => {
    const voiceProp = StandardVoiceNode.getDeclaredProperties().find(
      (p) => p.name === "voice"
    );
    expect(voiceProp).toBeDefined();
    expect(voiceProp?.options.values).toEqual(VOICE_NAMES);
  });

  it("declares a string voice_id output", () => {
    expect(StandardVoiceNode.metadataOutputTypes).toEqual({ voice_id: "str" });
  });
});
