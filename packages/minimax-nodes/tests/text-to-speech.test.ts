import { describe, expect, it } from "vitest";
import { MinimaxTextToSpeechNode } from "../src/nodes/text-to-speech.js";
import { predictions, scriptedMinimax } from "./scripted.js";

const audioHex = Buffer.from("fake-audio").toString("hex");
const OK = {
  output: {
    data: { audio: audioHex },
    base_resp: { status_code: 0, status_msg: "success" }
  }
};

function makeNode(
  props: Record<string, unknown> = {}
): MinimaxTextToSpeechNode {
  return new MinimaxTextToSpeechNode(props);
}

describe("MinimaxTextToSpeechNode", () => {
  it("calls the tts route and decodes hex audio", async () => {
    const { provider, context } = scriptedMinimax(OK);
    const result = await makeNode({ text: "Hello world" }).process(context);

    const call = provider.endpointCalls[0];
    expect(call).toMatchObject({ model: "speech-2.6-hd", route: "tts" });
    expect(call.input.text).toBe("Hello world");
    expect(call.input.voice_setting).toMatchObject({
      voice_id: "English_Trustworth_Man"
    });

    expect(result.output).toMatchObject({
      type: "audio",
      content_type: "audio/mpeg",
      data: Buffer.from("fake-audio").toString("base64")
    });
    expect(String((result.output as Record<string, unknown>).data)).not.toMatch(
      /^data:/
    );
  });

  it("emits a prediction for the minimax provider, capability and model", async () => {
    const { context } = scriptedMinimax(OK);
    const node = makeNode({ text: "Hi", model: "speech-02-hd" });
    node.__node_id = "tts-1";
    await node.process(context);
    expect(predictions(context).at(-1)).toMatchObject({
      status: "completed",
      provider: "minimax",
      capability: "text_to_speech",
      model: "speech-02-hd",
      node_id: "tts-1"
    });
  });

  it("downloads hosted audio through the provider", async () => {
    const url = "https://cdn.minimax.io/speech.mp3";
    const { provider, context } = scriptedMinimax(
      { output: { data: { audio: url } } },
      { [url]: Uint8Array.from([9, 8]) }
    );
    const result = await makeNode({ text: "Hi" }).process(context);
    expect(provider.downloadCalls.map((call) => call.url)).toEqual([url]);
    expect(result.output.data).toBe(Buffer.from([9, 8]).toString("base64"));
  });

  it("never sends a key from the node", async () => {
    const { provider, context } = scriptedMinimax(OK);
    const node = makeNode({ text: "Hi" });
    node.setDynamic("_secrets", { MINIMAX_API_KEY: "from-secrets" });
    await node.process(context);
    expect(JSON.stringify(provider.endpointCalls[0].input)).not.toContain(
      "from-secrets"
    );
  });

  it("throws when the text is empty", async () => {
    await expect(makeNode({ text: "" }).process()).rejects.toThrow(
      "Text is required"
    );
  });

  it("needs a processing context to reach the provider", async () => {
    await expect(makeNode({ text: "Hi" }).process()).rejects.toThrow(
      "requires a processing context"
    );
  });

  it("omits emotion when set to auto", async () => {
    const { provider, context } = scriptedMinimax(OK);
    await makeNode({ text: "Hi", emotion: "auto" }).process(context);
    const voiceSetting = provider.endpointCalls[0].input
      .voice_setting as Record<string, unknown>;
    expect(voiceSetting.emotion).toBeUndefined();
  });

  it("includes emotion when explicitly chosen", async () => {
    const { provider, context } = scriptedMinimax(OK);
    await makeNode({ text: "Hi", emotion: "happy" }).process(context);
    const voiceSetting = provider.endpointCalls[0].input
      .voice_setting as Record<string, unknown>;
    expect(voiceSetting.emotion).toBe("happy");
  });

  it("omits language_boost when set to auto and includes it otherwise", async () => {
    const { provider, context } = scriptedMinimax(OK);
    await makeNode({ text: "Hi", language_boost: "auto" }).process(context);
    await makeNode({ text: "Hi", language_boost: "English" }).process(context);
    expect(provider.endpointCalls[0].input.language_boost).toBeUndefined();
    expect(provider.endpointCalls[1].input.language_boost).toBe("English");
  });

  it("clamps the speed into the supported range", async () => {
    const { provider, context } = scriptedMinimax(OK);
    await makeNode({ text: "Hi", speed: 9 }).process(context);
    const voiceSetting = provider.endpointCalls[0].input
      .voice_setting as Record<string, unknown>;
    expect(voiceSetting.speed).toBe(2.0);
  });

  it("passes the selected format through to audio_setting", async () => {
    const { provider, context } = scriptedMinimax(OK);
    await makeNode({ text: "Hi", format: "wav" }).process(context);
    const audioSetting = provider.endpointCalls[0].input
      .audio_setting as Record<string, unknown>;
    expect(audioSetting.format).toBe("wav");
  });

  it("throws when the reply carries no audio", async () => {
    const { context } = scriptedMinimax({ output: { data: {} } });
    await expect(makeNode({ text: "Hi" }).process(context)).rejects.toThrow(
      "MiniMax t2a_v2 returned no audio data"
    );
  });

  it("surfaces provider errors", async () => {
    const { context } = scriptedMinimax(
      new Error("MiniMax t2a_v2 failed: invalid api key (code 1004)")
    );
    await expect(makeNode({ text: "Hi" }).process(context)).rejects.toThrow(
      "invalid api key"
    );
  });
});
