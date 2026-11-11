/**
 * Request parity for the ElevenLabs request nodes.
 *
 * The expected requests below were recorded from the pack's own transport
 * before the nodes moved onto the runtime ElevenLabsProvider. Each node runs
 * against the real provider with its fetch injected, so the test pins what
 * reaches the wire: URL, method, headers and body.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElevenLabsProvider, ProcessingContext } from "@nodetool-ai/runtime";
import { TextToSpeechNode } from "../src/nodes/text-to-speech.js";
import { SpeechToTextNode } from "../src/nodes/speech-to-text.js";

const KEY = "el_parity";

const fetchMock = vi.fn<typeof fetch>();

function call(index = 0): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit];
  return { url, init };
}

function headersOf(init: RequestInit): Record<string, string> {
  return Object.fromEntries(new Headers(init.headers).entries());
}

/** A multipart body as ordered [name, value] pairs, files spelled out. */
async function formEntries(body: unknown): Promise<unknown[]> {
  expect(body).toBeInstanceOf(FormData);
  const out: unknown[] = [];
  for (const [name, value] of (body as FormData).entries()) {
    if (typeof value === "string") {
      out.push([name, value]);
    } else {
      out.push([
        name,
        {
          filename: value.name,
          type: value.type,
          bytes: Array.from(new Uint8Array(await value.arrayBuffer()))
        }
      ]);
    }
  }
  return out;
}

function runContext(): ProcessingContext {
  const provider = new ElevenLabsProvider(
    { ELEVENLABS_API_KEY: KEY },
    { fetchFn: fetchMock }
  );
  const ctx = new ProcessingContext({ jobId: "job-parity" });
  ctx.setProviderResolver(async () => provider);
  return ctx;
}

function withSecrets<T extends { setDynamic: (k: string, v: unknown) => void }>(
  node: T
): T {
  node.setDynamic("_secrets", { ELEVENLABS_API_KEY: KEY });
  return node;
}

beforeEach(() => {
  fetchMock.mockReset();
  // No request may leave the process: anything that bypasses the provider
  // lands on the same mock.
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ElevenLabs request parity", () => {
  it("TextToSpeech posts the voice route with no output_format query", async () => {
    const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);
    fetchMock.mockImplementation(async () => new Response(mp3, { status: 200 }));
    const node = withSecrets(
      new TextToSpeechNode({
        voice_id: "customVoice42",
        text: "Hello there",
        model_id: "eleven_multilingual_v2",
        language_code: "de",
        stability: 0.8,
        style: 0.2,
        use_speaker_boost: true,
        seed: 9,
        optimize_streaming_latency: 3,
        text_normalization: "on"
      })
    );

    const out = await node.process(runContext());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init } = call();
    expect(url).toBe("https://api.elevenlabs.io/v1/text-to-speech/customVoice42");
    expect(init.method).toBe("POST");
    expect(headersOf(init)).toEqual({
      "xi-api-key": KEY,
      "content-type": "application/json"
    });
    // Key order is part of the wire format, so compare the raw string.
    expect(String(init.body)).toBe(
      JSON.stringify({
        text: "Hello there",
        model_id: "eleven_multilingual_v2",
        optimize_streaming_latency: 3,
        language_code: "de",
        seed: 9,
        text_normalization: "on",
        voice_settings: { stability: 0.8, style: 0.2, use_speaker_boost: true }
      })
    );
    expect(out.output).toEqual({
      type: "audio",
      data: `data:audio/mpeg;base64,${Buffer.from(mp3).toString("base64")}`
    });
  });

  it("TextToSpeech with defaults sends no voice_settings", async () => {
    fetchMock.mockImplementation(
      async () => new Response(new Uint8Array([1]), { status: 200 })
    );
    const node = withSecrets(new TextToSpeechNode({ text: "Hi" }));

    await node.process(runContext());

    const { url, init } = call();
    expect(url).toBe(
      "https://api.elevenlabs.io/v1/text-to-speech/9BWtsMINqrJLrRacOk9x"
    );
    expect(String(init.body)).toBe(
      JSON.stringify({
        text: "Hi",
        model_id: "eleven_monolingual_v1",
        optimize_streaming_latency: 2,
        text_normalization: "auto"
      })
    );
  });

  it("SpeechToText posts the multipart form in the recorded field order", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            text: "hallo",
            language_code: "de",
            language_probability: 0.97,
            words: [{ text: "hallo" }],
            transcription_id: "tr-1"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    );
    const audioBytes = Buffer.from("RIFF-wave-bytes");
    const node = withSecrets(
      new SpeechToTextNode({
        audio: { type: "audio", data: audioBytes.toString("base64") },
        model_id: "scribe_v1",
        language_code: "de",
        tag_audio_events: false,
        num_speakers: 2,
        timestamps_granularity: "character",
        diarize: true,
        file_format: "pcm_s16le_16"
      })
    );

    const out = await node.process(runContext());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init } = call();
    expect(url).toBe("https://api.elevenlabs.io/v1/speech-to-text");
    expect(init.method).toBe("POST");
    expect(headersOf(init)).toEqual({ "xi-api-key": KEY });
    expect(await formEntries(init.body)).toEqual([
      ["model_id", "scribe_v1"],
      [
        "file",
        { filename: "audio.wav", type: "audio/wav", bytes: Array.from(audioBytes) }
      ],
      ["language_code", "de"],
      ["tag_audio_events", "false"],
      ["num_speakers", "2"],
      ["timestamps_granularity", "character"],
      ["diarize", "true"],
      ["file_format", "pcm_s16le_16"]
    ]);
    expect(out).toEqual({
      text: "hallo",
      language_code: "de",
      language_probability: 0.97,
      words: [{ text: "hallo" }],
      transcription_id: "tr-1"
    });
  });

  it("reports a failed request with the vendor's error text", async () => {
    fetchMock.mockImplementation(
      async () => new Response("quota exceeded", { status: 401 })
    );
    const node = withSecrets(new TextToSpeechNode({ text: "Hi" }));

    await expect(node.process(runContext())).rejects.toThrow(
      "ElevenLabs API error: quota exceeded"
    );
  });
});
