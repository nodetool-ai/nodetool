import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProcessingContext, ScriptedProvider } from "@nodetool-ai/runtime";
import { SpeechToTextNode } from "../src/nodes/speech-to-text.js";

// Minimal valid WAV header encoded as base64
const WAV_BASE64 =
  "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

const audioFromDataUri = {
  type: "audio",
  data: `data:audio/wav;base64,${WAV_BASE64}`
};

const TRANSCRIPTION = {
  text: "Hello world",
  language_code: "en",
  language_probability: 0.99,
  words: [{ word: "Hello" }, { word: "world" }],
  transcription_id: "tid-123"
};

let provider: ScriptedProvider;
let ctx: ProcessingContext;

/** Helper: create a node with properties assigned. */
function makeNode(props: Record<string, unknown> = {}): SpeechToTextNode {
  return new SpeechToTextNode(props);
}

/** The form fields of the n-th endpoint call the node made. */
function fieldsOf(index = 0): Record<string, unknown> {
  return provider.endpointCalls[index].input;
}

describe("SpeechToTextNode", () => {
  beforeEach(() => {
    provider = new ScriptedProvider([], {
      providerId: "elevenlabs",
      endpoints: { "*": { output: TRANSCRIPTION, requestId: "tid-123" } }
    });
    ctx = new ProcessingContext({ jobId: "job-1" });
    ctx.setProviderResolver(async () => provider);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("transcribes audio from a data URI through the speech-to-text route", async () => {
    const node = makeNode({ audio: audioFromDataUri });
    const result = await node.process(ctx);

    expect(provider.endpointCalls).toHaveLength(1);
    expect(provider.endpointCalls[0]).toMatchObject({
      model: "scribe_v2",
      route: "speech-to-text",
      input: {
        model_id: "scribe_v2",
        file: { mimeType: "audio/wav", filename: "audio.wav" },
        tag_audio_events: "true",
        timestamps_granularity: "word",
        diarize: "false",
        file_format: "other"
      }
    });
    const file = fieldsOf().file as { bytes: Uint8Array };
    expect(Buffer.from(file.bytes).toString("base64")).toBe(WAV_BASE64);

    expect(result).toEqual(TRANSCRIPTION);
  });

  it("emits a prediction message for the provider, capability and model", async () => {
    const node = makeNode({ audio: audioFromDataUri, model_id: "scribe_v1" });
    await node.process(ctx);

    const predictions = ctx
      .getMessages()
      .filter((message) => message.type === "prediction");
    expect(predictions.at(-1)).toMatchObject({
      status: "completed",
      provider: "elevenlabs",
      capability: "automatic_speech_recognition",
      model: "scribe_v1"
    });
  });

  it("requires a processing context", async () => {
    const node = makeNode({ audio: audioFromDataUri });
    await expect(node.process()).rejects.toThrow("processing context");
  });

  it("throws when audio input is not an object", async () => {
    const node = makeNode({ audio: null });
    await expect(node.process(ctx)).rejects.toThrow("Audio input is required");
  });

  it("throws when audio ref carries no resolvable source", async () => {
    const node = makeNode({ audio: { type: "audio" } });
    await expect(node.process(ctx)).rejects.toThrow(
      "Failed to resolve audio input for transcription"
    );
  });

  it("accepts a native ref carrying raw base64 (no data: prefix)", async () => {
    // MiniMax and other native refs carry raw base64 in `data` with no
    // `data:` prefix. The canonical resolver decodes it instead of rejecting it.
    const node = makeNode({ audio: { type: "audio", data: WAV_BASE64 } });
    const result = await node.process(ctx);

    expect(provider.endpointCalls).toHaveLength(1);
    expect(result.text).toBe("Hello world");
  });

  it("fetches audio from a URI when data is absent", async () => {
    // The audio file comes through the media egress policy; the transcription
    // goes through the provider.
    const fakeAudioBuf = Buffer.from("RIFF....WAVE");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () =>
        fakeAudioBuf.buffer.slice(
          fakeAudioBuf.byteOffset,
          fakeAudioBuf.byteOffset + fakeAudioBuf.byteLength
        )
    });
    vi.stubGlobal("fetch", mockFetch);

    const node = makeNode({ audio: { uri: "https://example.com/audio.wav" } });
    const result = await node.process(ctx);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe("https://example.com/audio.wav");
    const file = fieldsOf().file as { bytes: Uint8Array };
    expect(Buffer.from(file.bytes).toString()).toBe("RIFF....WAVE");
    expect(result.text).toBe("Hello world");
  });

  it("resolves an asset:// uri via the processing context", async () => {
    const resolvedBytes = new Uint8Array(Buffer.from(WAV_BASE64, "base64"));
    const resolveAssetBytes = vi
      .spyOn(ctx, "resolveAssetBytes")
      .mockResolvedValue({ bytes: resolvedBytes, attempts: [] });

    const node = makeNode({ audio: { type: "audio", uri: "asset://asset-123" } });
    const result = await node.process(ctx);

    expect(resolveAssetBytes).toHaveBeenCalledWith("asset://asset-123", {
      requireOwnedAsset: true
    });
    expect((fieldsOf().file as { bytes: Uint8Array }).bytes).toEqual(
      resolvedBytes
    );
    expect(result.text).toBe("Hello world");
  });

  it("surfaces the provider's error", async () => {
    provider.scriptEndpoint("scribe_v2", new Error("ElevenLabs API error: Bad Request"));
    const node = makeNode({ audio: audioFromDataUri });
    await expect(node.process(ctx)).rejects.toThrow("ElevenLabs API error");
  });

  it("rejects a non-object transcription", async () => {
    provider.scriptEndpoint("scribe_v2", { output: "nope" });
    const node = makeNode({ audio: audioFromDataUri });
    await expect(node.process(ctx)).rejects.toThrow("non-object transcription");
  });

  it("includes language_code and num_speakers only when set", async () => {
    await makeNode({ audio: audioFromDataUri }).process(ctx);
    expect(fieldsOf(0).language_code).toBeUndefined();
    expect(fieldsOf(0).num_speakers).toBeUndefined();

    await makeNode({
      audio: audioFromDataUri,
      language_code: "es",
      num_speakers: 3
    }).process(ctx);
    expect(fieldsOf(1).language_code).toBe("es");
    expect(fieldsOf(1).num_speakers).toBe("3");
  });
});
