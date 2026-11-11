import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/external-media-fetch.js", () => ({
  fetchExternalMedia: vi.fn()
}));

import { fetchExternalMedia } from "../../src/external-media-fetch.js";
import { ProcessingContext } from "../../src/context.js";
import { ElevenLabsProvider } from "../../src/providers/elevenlabs-provider.js";

function providerWith(fetchFn: typeof fetch): ElevenLabsProvider {
  return new ElevenLabsProvider({ ELEVENLABS_API_KEY: "el_key" }, { fetchFn });
}

function sent(fetchFn: ReturnType<typeof vi.fn>, index = 0) {
  const [url, init] = fetchFn.mock.calls[index] as [string, RequestInit];
  return { url, init, headers: Object.fromEntries(new Headers(init.headers).entries()) };
}

const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);

describe("ElevenLabsProvider endpoint calls", () => {
  it("supports endpoint calls", () => {
    expect(providerWith(vi.fn()).supportsEndpointCalls()).toBe(true);
  });

  it("posts text-to-speech to the voice path and returns the audio", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(mp3, {
          status: 200,
          headers: { "content-type": "audio/mpeg", "request-id": "el-req-1" }
        })
    );
    const result = await providerWith(fetchFn).callEndpoint({
      model: "eleven_v3",
      route: "text-to-speech",
      input: { voice_id: "voice1", text: "Hi", model_id: "eleven_v3", seed: 3 }
    });

    expect(result).toEqual({
      output: { data: mp3, mimeType: "audio/mpeg" },
      requestId: "el-req-1"
    });
    const request = sent(fetchFn);
    expect(request.url).toBe("https://api.elevenlabs.io/v1/text-to-speech/voice1");
    expect(request.init.method).toBe("POST");
    expect(request.headers).toEqual({
      "xi-api-key": "el_key",
      "content-type": "application/json"
    });
    expect(String(request.init.body)).toBe(
      JSON.stringify({ text: "Hi", model_id: "eleven_v3", seed: 3 })
    );
  });

  it("puts output_format in the query and defaults model_id to the model", async () => {
    const fetchFn = vi.fn(async () => new Response(mp3, { status: 200 }));
    const result = await providerWith(fetchFn).callEndpoint({
      model: "eleven_flash_v2_5",
      route: "text-to-speech",
      input: { voice_id: "v/1", output_format: "pcm_24000", text: "Hi" }
    });

    const request = sent(fetchFn);
    expect(request.url).toBe(
      "https://api.elevenlabs.io/v1/text-to-speech/v%2F1?output_format=pcm_24000"
    );
    expect(JSON.parse(String(request.init.body))).toEqual({
      text: "Hi",
      model_id: "eleven_flash_v2_5"
    });
    expect(result.output).toMatchObject({ mimeType: "audio/mpeg" });
    expect(result.requestId).toBeNull();
  });

  it("needs a voice id for text-to-speech", async () => {
    const fetchFn = vi.fn();
    await expect(
      providerWith(fetchFn).callEndpoint({
        model: "m",
        route: "text-to-speech",
        input: { text: "Hi" }
      })
    ).rejects.toThrow("needs input.voice_id");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("posts speech-to-text as multipart fields in input order", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ text: "hello", transcription_id: "tr-7" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
    );
    const audio = new Uint8Array([82, 73, 70, 70]);
    const result = await providerWith(fetchFn).callEndpoint({
      model: "scribe_v2",
      route: "speech-to-text",
      input: {
        model_id: "scribe_v2",
        file: { bytes: audio, mimeType: "audio/wav", filename: "audio.wav" },
        language_code: undefined,
        num_speakers: 2,
        diarize: true
      }
    });

    expect(result).toEqual({
      output: { text: "hello", transcription_id: "tr-7" },
      requestId: "tr-7"
    });
    const request = sent(fetchFn);
    expect(request.url).toBe("https://api.elevenlabs.io/v1/speech-to-text");
    expect(request.headers).toEqual({ "xi-api-key": "el_key" });
    const form = request.init.body as FormData;
    expect([...form.keys()]).toEqual(["model_id", "file", "num_speakers", "diarize"]);
    expect(form.get("num_speakers")).toBe("2");
    expect(form.get("diarize")).toBe("true");
    const file = form.get("file") as File;
    expect(file.name).toBe("audio.wav");
    expect(file.type).toBe("audio/wav");
    expect(Array.from(new Uint8Array(await file.arrayBuffer()))).toEqual(
      Array.from(audio)
    );
  });

  it("rejects a speech-to-text field it cannot send", async () => {
    const fetchFn = vi.fn();
    await expect(
      providerWith(fetchFn).callEndpoint({
        model: "scribe_v2",
        route: "speech-to-text",
        input: { model_id: "scribe_v2", extra: { nested: true } }
      })
    ).rejects.toThrow('field "extra" must be a string, number, boolean or file part');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("reports the vendor's error text", async () => {
    const fetchFn = vi.fn(async () => new Response("invalid voice", { status: 400 }));
    await expect(
      providerWith(fetchFn).callEndpoint({
        model: "m",
        route: "text-to-speech",
        input: { voice_id: "x", text: "Hi" }
      })
    ).rejects.toThrow("ElevenLabs API error: invalid voice");
  });

  it("rejects a missing or unknown route before any request", async () => {
    const fetchFn = vi.fn();
    const provider = providerWith(fetchFn);
    await expect(provider.callEndpoint({ model: "m", input: {} })).rejects.toThrow(
      /route must be "text-to-speech" or "speech-to-text", got none/
    );
    await expect(
      provider.callEndpoint({ model: "m", route: "dubbing", input: {} })
    ).rejects.toThrow(/got "dubbing"/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("passes the abort signal to fetch", async () => {
    const fetchFn = vi.fn(async () => new Response(mp3, { status: 200 }));
    const controller = new AbortController();
    await providerWith(fetchFn).callEndpoint({
      model: "m",
      route: "text-to-speech",
      input: { voice_id: "v", text: "Hi" },
      signal: controller.signal
    });
    expect(sent(fetchFn).init.signal).toBe(controller.signal);
  });

  it("keeps audio bytes out of the prediction message through the seam", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ text: "hello", transcription_id: "tr-8" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
    );
    const provider = providerWith(fetchFn);
    const ctx = new ProcessingContext({ jobId: "job-1" });
    ctx.setProviderResolver(async () => provider);

    await ctx.callProviderEndpoint({
      provider: "elevenlabs",
      capability: "automatic_speech_recognition",
      model: "scribe_v2",
      route: "speech-to-text",
      input: {
        model_id: "scribe_v2",
        file: { bytes: new Uint8Array(4096), mimeType: "audio/wav", filename: "a.wav" }
      }
    });

    const completed = ctx
      .getMessages()
      .filter((message) => message.type === "prediction")
      .at(-1);
    expect(completed).toMatchObject({
      status: "completed",
      provider: "elevenlabs",
      capability: "automatic_speech_recognition",
      model: "scribe_v2",
      params: { file: { bytes: { bytes: 4096 }, mimeType: "audio/wav" } },
      receipt: { provider_request_id: "tr-8" }
    });
  });
});

describe("ElevenLabsProvider media transfer", () => {
  it("has no upload step: media travels in the request", async () => {
    await expect(
      providerWith(vi.fn()).uploadMedia({
        bytes: new Uint8Array([1]),
        mimeType: "audio/wav"
      })
    ).rejects.toThrow("elevenlabs does not support media uploads");
  });

  it("downloads a result URL through the media egress policy", async () => {
    vi.mocked(fetchExternalMedia).mockResolvedValueOnce(
      new Response(new Uint8Array([7, 8]), { status: 200 })
    );
    const bytes = await providerWith(vi.fn()).downloadMedia(
      "https://cdn.example/a.mp3"
    );
    expect(Array.from(bytes)).toEqual([7, 8]);
    expect(fetchExternalMedia).toHaveBeenCalledWith(
      "https://cdn.example/a.mp3",
      undefined
    );
  });
});
