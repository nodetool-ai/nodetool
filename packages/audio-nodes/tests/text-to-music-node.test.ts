import { describe, it, expect } from "vitest";
import { TextToMusicNode } from "@nodetool-ai/audio-nodes";

function musicModel(provider: string, id: string) {
  return { type: "music_model", id, provider, name: id };
}

const audioData = (out: Record<string, unknown>): Buffer => {
  const audio = out.audio as { type: string; data: string };
  expect(audio.type).toBe("audio");
  return Buffer.from(audio.data, "base64");
};

describe("TextToMusicNode", () => {
  it("emits an AudioRef from the encoded music bytes", async () => {
    const mp3 = new Uint8Array([0xff, 0xfb, 0x10, 0x20]);
    let req: Record<string, unknown> | undefined;
    const ctx = {
      textToMusic: async (r: Record<string, unknown>) => {
        req = r;
        return { data: mp3, mimeType: "audio/mpeg" };
      }
    };
    const node = new TextToMusicNode({
      prompt: "upbeat synthwave",
      lyrics: "",
      model: musicModel("replicate", "meta/musicgen"),
      duration: 8
    });
    const out = await node.process(ctx as never);
    expect(audioData(out)).toEqual(Buffer.from(mp3));
    expect(req?.provider).toBe("replicate");
    expect(req?.model).toBe("meta/musicgen");
    expect(req?.capability).toBe("text_to_music");
    const params = req?.params as Record<string, unknown>;
    expect(params.prompt).toBe("upbeat synthwave");
    expect(params.duration_seconds).toBe(8);
    // Empty lyrics are dropped so instrumental-only models aren't forced to sing.
    expect(params.lyrics).toBeUndefined();
  });

  it("forwards lyrics when provided", async () => {
    let req: Record<string, unknown> | undefined;
    const ctx = {
      textToMusic: async (r: Record<string, unknown>) => {
        req = r;
        return { data: new Uint8Array([1]), mimeType: "audio/mpeg" };
      }
    };
    const node = new TextToMusicNode({
      prompt: "ballad",
      lyrics: "[Verse]\nhello",
      model: musicModel("minimax", "music-2.6"),
      duration: 30
    });
    await node.process(ctx as never);
    const params = req?.params as Record<string, unknown>;
    expect(params.lyrics).toBe("[Verse]\nhello");
  });

  it("throws when no provider/model is configured", async () => {
    const node = new TextToMusicNode({ prompt: "hi", model: {} as never });
    await expect(node.process({} as never)).rejects.toThrow(
      /requires a music provider/
    );
  });
});
