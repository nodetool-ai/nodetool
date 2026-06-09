import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MinimaxTextToSpeechNode } from "../src/nodes/text-to-speech.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const audioHex = Buffer.from("fake-audio").toString("hex");

function makeNode(
  props: Record<string, unknown> = {}
): MinimaxTextToSpeechNode {
  return new MinimaxTextToSpeechNode(props);
}

function bodyOf(call: number): Record<string, unknown> {
  const [, options] = mockFetch.mock.calls[call] as [string, RequestInit];
  return JSON.parse(options.body as string) as Record<string, unknown>;
}

describe("MinimaxTextToSpeechNode", () => {
  const originalApiKey = process.env.MINIMAX_API_KEY;

  beforeEach(() => {
    process.env.MINIMAX_API_KEY = "test-key";
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { audio: audioHex },
        base_resp: { status_code: 0, status_msg: "success" }
      })
    });
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.MINIMAX_API_KEY;
    } else {
      process.env.MINIMAX_API_KEY = originalApiKey;
    }
    mockFetch.mockReset();
  });

  it("posts to the t2a_v2 endpoint with a bearer token", async () => {
    const node = makeNode({ text: "Hello world" });
    const result = await node.process();

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v1/t2a_v2");
    expect(options.method).toBe("POST");
    expect((options.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-key"
    );

    const body = bodyOf(0);
    expect(body.text).toBe("Hello world");
    expect((body.voice_setting as Record<string, unknown>).voice_id).toBe(
      "English_Trustworth_Man"
    );

    expect(result.output).toMatchObject({
      type: "audio",
      content_type: "audio/mpeg",
      data: Buffer.from("fake-audio").toString("base64")
    });
    expect(
      String((result.output as Record<string, unknown>).data)
    ).not.toMatch(/^data:/);
  });

  it("reads the API key from injected secrets", async () => {
    delete process.env.MINIMAX_API_KEY;
    const node = makeNode({ text: "Hi" });
    node.setDynamic("_secrets", { MINIMAX_API_KEY: "from-secrets" });
    await node.process();

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>).Authorization).toBe(
      "Bearer from-secrets"
    );
  });

  it("throws when the API key is missing", async () => {
    delete process.env.MINIMAX_API_KEY;
    const node = makeNode({ text: "Hi" });
    await expect(node.process()).rejects.toThrow("MINIMAX_API_KEY");
  });

  it("throws when the text is empty", async () => {
    const node = makeNode({ text: "" });
    await expect(node.process()).rejects.toThrow("Text is required");
  });

  it("omits emotion when set to auto", async () => {
    await makeNode({ text: "Hi", emotion: "auto" }).process();
    const voiceSetting = bodyOf(0).voice_setting as Record<string, unknown>;
    expect(voiceSetting.emotion).toBeUndefined();
  });

  it("includes emotion when explicitly chosen", async () => {
    await makeNode({ text: "Hi", emotion: "happy" }).process();
    const voiceSetting = bodyOf(0).voice_setting as Record<string, unknown>;
    expect(voiceSetting.emotion).toBe("happy");
  });

  it("omits language_boost when set to auto and includes it otherwise", async () => {
    await makeNode({ text: "Hi", language_boost: "auto" }).process();
    expect(bodyOf(0).language_boost).toBeUndefined();

    mockFetch.mockClear();
    await makeNode({ text: "Hi", language_boost: "English" }).process();
    expect(bodyOf(0).language_boost).toBe("English");
  });

  it("clamps the speed into the supported range", async () => {
    await makeNode({ text: "Hi", speed: 9 }).process();
    const voiceSetting = bodyOf(0).voice_setting as Record<string, unknown>;
    expect(voiceSetting.speed).toBe(2.0);
  });

  it("passes the selected format through to audio_setting", async () => {
    await makeNode({ text: "Hi", format: "wav" }).process();
    const audioSetting = bodyOf(0).audio_setting as Record<string, unknown>;
    expect(audioSetting.format).toBe("wav");
  });

  it("surfaces MiniMax base_resp errors", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        base_resp: { status_code: 1004, status_msg: "invalid api key" }
      })
    });
    await expect(makeNode({ text: "Hi" }).process()).rejects.toThrow(
      "invalid api key"
    );
  });

  it("surfaces HTTP errors", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, text: async () => "no" });
    await expect(makeNode({ text: "Hi" }).process()).rejects.toThrow(
      "t2a_v2 failed"
    );
  });
});
