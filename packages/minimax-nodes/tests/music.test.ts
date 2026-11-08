import { describe, expect, it } from "vitest";
import { MinimaxMusicNode } from "../src/nodes/music.js";
import { predictions, scriptedMinimax } from "./scripted.js";

const audioHex = Buffer.from("fake-song").toString("hex");
const OK = {
  output: {
    data: { audio: audioHex },
    base_resp: { status_code: 0, status_msg: "success" }
  }
};

function makeNode(props: Record<string, unknown> = {}): MinimaxMusicNode {
  return new MinimaxMusicNode(props);
}

describe("MinimaxMusicNode", () => {
  it("sends prompt and lyrics to the music route", async () => {
    const { provider, context } = scriptedMinimax(OK);
    const node = makeNode({ prompt: "lo-fi beat", lyrics: "[Verse]\nhello" });
    const result = await node.process(context);

    expect(provider.endpointCalls[0]).toMatchObject({
      model: "music-2.6",
      route: "music",
      input: {
        model: "music-2.6",
        prompt: "lo-fi beat",
        lyrics: "[Verse]\nhello",
        output_format: "hex"
      }
    });
    expect(predictions(context).at(-1)).toMatchObject({
      status: "completed",
      provider: "minimax",
      capability: "text_to_music",
      model: "music-2.6"
    });
    expect(result.output).toMatchObject({
      type: "audio",
      content_type: "audio/mpeg",
      data: Buffer.from("fake-song").toString("base64")
    });
    expect(String((result.output as Record<string, unknown>).data)).not.toMatch(
      /^data:/
    );
  });

  it("requires a prompt", async () => {
    await expect(
      makeNode({ prompt: "", lyrics: "x" }).process()
    ).rejects.toThrow("Prompt is required");
  });

  it("requires lyrics", async () => {
    await expect(
      makeNode({ prompt: "x", lyrics: "" }).process()
    ).rejects.toThrow("Lyrics are required");
  });

  it("surfaces provider errors", async () => {
    const { context } = scriptedMinimax(
      new Error("MiniMax music_generation failed: invalid params (code 2013)")
    );
    await expect(
      makeNode({ prompt: "x", lyrics: "y" }).process(context)
    ).rejects.toThrow("invalid params");
  });
});
