import { beforeEach, describe, expect, it } from "vitest";
import { ProcessingContext, ScriptedProvider } from "@nodetool-ai/runtime";
import { TextToSpeechNode } from "../src/nodes/text-to-speech.js";

const fakeAudio = new Uint8Array(Buffer.from("fake-audio-data"));

let provider: ScriptedProvider;
let ctx: ProcessingContext;

/** Helper: create a node with properties assigned. */
function makeNode(props: Record<string, unknown> = {}): TextToSpeechNode {
  return new TextToSpeechNode(props);
}

/** The input of the n-th endpoint call the node made. */
function inputOf(index = 0): Record<string, unknown> {
  return provider.endpointCalls[index].input;
}

describe("TextToSpeechNode", () => {
  beforeEach(() => {
    provider = new ScriptedProvider([], {
      providerId: "elevenlabs",
      endpoints: {
        "*": {
          output: { data: fakeAudio, mimeType: "audio/mpeg" },
          requestId: "req-1"
        }
      }
    });
    ctx = new ProcessingContext({ jobId: "job-1" });
    ctx.setProviderResolver(async () => provider);
  });

  it("calls the text-to-speech route with the voice id and payload", async () => {
    const node = makeNode({
      voice_id: "9BWtsMINqrJLrRacOk9x",
      text: "Hello world"
    });
    const result = await node.process(ctx);

    expect(provider.endpointCalls).toHaveLength(1);
    expect(provider.endpointCalls[0]).toMatchObject({
      model: "eleven_monolingual_v1",
      route: "text-to-speech",
      input: {
        voice_id: "9BWtsMINqrJLrRacOk9x",
        text: "Hello world",
        model_id: "eleven_monolingual_v1"
      }
    });
    expect(result.output).toEqual({
      type: "audio",
      data: `data:audio/mpeg;base64,${Buffer.from(fakeAudio).toString("base64")}`
    });
  });

  it("emits a prediction message for the provider, capability and model", async () => {
    const node = makeNode({ text: "Hello", model_id: "eleven_v3" });
    await node.process(ctx);

    const predictions = ctx
      .getMessages()
      .filter((message) => message.type === "prediction");
    expect(predictions.at(-1)).toMatchObject({
      status: "completed",
      provider: "elevenlabs",
      capability: "text_to_speech",
      model: "eleven_v3"
    });
    // The audio bytes stay out of the message.
    expect(predictions.at(-1)).toMatchObject({ data: null });
  });

  it("needs no API key in the node: the provider holds it", async () => {
    const node = makeNode({ text: "Hello" });
    node.setDynamic("_secrets", {});
    await expect(node.process(ctx)).resolves.toBeDefined();
  });

  it("requires a processing context", async () => {
    const node = makeNode({ text: "Hello" });
    await expect(node.process()).rejects.toThrow("processing context");
  });

  it("throws when voice_id is empty", async () => {
    const node = makeNode({ voice_id: "", text: "Hello" });
    await expect(node.process(ctx)).rejects.toThrow("voice_id is required");
  });

  it("uses a custom voice_id directly", async () => {
    const node = makeNode({ voice_id: "customVoiceId123", text: "Hello" });
    await node.process(ctx);

    expect(inputOf().voice_id).toBe("customVoiceId123");
  });

  it("defaults to Aria's voice ID when voice_id is unset", async () => {
    const node = makeNode({ text: "Hello" });
    await node.process(ctx);

    expect(inputOf().voice_id).toBe("9BWtsMINqrJLrRacOk9x");
  });

  it("throws when text is empty", async () => {
    const node = makeNode({ voice_id: "9BWtsMINqrJLrRacOk9x", text: "" });
    await expect(node.process(ctx)).rejects.toThrow("Text is required");
  });

  it("includes voice_settings when stability is non-default", async () => {
    const node = makeNode({
      voice_id: "9BWtsMINqrJLrRacOk9x",
      text: "Hello",
      stability: 0.8
    });
    await node.process(ctx);

    expect(inputOf().voice_settings).toEqual({ stability: 0.8 });
  });

  it("includes language_code when not 'none'", async () => {
    const node = makeNode({
      voice_id: "9BWtsMINqrJLrRacOk9x",
      text: "Hello",
      language_code: "en"
    });
    await node.process(ctx);

    expect(inputOf().language_code).toBe("en");
  });

  it("omits language_code when set to 'none'", async () => {
    const node = makeNode({
      voice_id: "9BWtsMINqrJLrRacOk9x",
      text: "Hello",
      language_code: "none"
    });
    await node.process(ctx);

    expect(inputOf()).not.toHaveProperty("language_code");
  });

  it("includes seed when not -1", async () => {
    const node = makeNode({
      voice_id: "9BWtsMINqrJLrRacOk9x",
      text: "Hello",
      seed: 42
    });
    await node.process(ctx);

    expect(inputOf().seed).toBe(42);
  });

  it("surfaces the provider's error", async () => {
    provider.scriptEndpoint(
      "eleven_monolingual_v1",
      new Error("ElevenLabs API error: Unauthorized")
    );
    const node = makeNode({ voice_id: "9BWtsMINqrJLrRacOk9x", text: "Hello" });
    await expect(node.process(ctx)).rejects.toThrow(
      "ElevenLabs API error: Unauthorized"
    );
  });

  it("throws when the provider returns no audio bytes", async () => {
    provider.scriptEndpoint("eleven_monolingual_v1", { output: {} });
    const node = makeNode({ text: "Hello" });
    await expect(node.process(ctx)).rejects.toThrow("ElevenLabs returned no audio");
  });

  it("offers eleven_v3 as a model option", () => {
    const modelProp = TextToSpeechNode.getDeclaredProperties().find(
      (p) => p.name === "model_id"
    );
    expect(modelProp?.options.values).toContain("eleven_v3");
  });

  it("sends the selected model_id as the model and in the payload", async () => {
    const node = makeNode({
      voice_id: "9BWtsMINqrJLrRacOk9x",
      text: "Hello",
      model_id: "eleven_v3"
    });
    await node.process(ctx);

    expect(provider.endpointCalls[0].model).toBe("eleven_v3");
    expect(inputOf().model_id).toBe("eleven_v3");
  });
});
