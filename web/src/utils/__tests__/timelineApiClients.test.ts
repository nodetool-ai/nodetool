import { restFetch } from "../../lib/rest-fetch";
import { bakeAudioAnimation } from "../timelineAudioBake";
import { isolateSubject } from "../timelineIsolateSubject";

jest.mock("../../lib/rest-fetch", () => ({ restFetch: jest.fn() }));

const mockFetch = restFetch as jest.Mock;

const reply = (ok: boolean, status: number, body: unknown) => ({
  ok,
  status,
  json: async () => {
    if (body === undefined) {
      throw new Error("no body");
    }
    return body;
  }
});

beforeEach(() => mockFetch.mockReset());

describe("bakeAudioAnimation", () => {
  const body = {
    audio_clip_id: "a",
    target_clip_id: "t",
    property: "scale" as const,
    output_range: [1, 2] as [number, number],
    mode: "envelope" as const
  };
  const result = {
    timeline_id: "tl",
    updated_at: "now",
    keyframeCount: 4
  };

  it("posts the body to the encoded timeline path and returns the result", async () => {
    mockFetch.mockResolvedValue(reply(true, 200, result));
    await expect(bakeAudioAnimation("a/b", body)).resolves.toEqual(result);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/timelines/a%2Fb/bake-audio-animation");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual(body);
  });

  it("rejects with the server detail", async () => {
    mockFetch.mockResolvedValue(reply(false, 422, { detail: "no audio" }));
    await expect(bakeAudioAnimation("tl", body)).rejects.toThrow("no audio");
  });

  it("falls back to the status when the error has no detail", async () => {
    mockFetch.mockResolvedValue(reply(false, 500, undefined));
    await expect(bakeAudioAnimation("tl", body)).rejects.toThrow(
      "Bake failed (500)"
    );
  });

  it("rejects a success response with the wrong shape", async () => {
    mockFetch.mockResolvedValue(reply(true, 200, { updated_at: "now" }));
    await expect(bakeAudioAnimation("tl", body)).rejects.toThrow(
      "Unexpected response"
    );
  });
});

describe("isolateSubject", () => {
  it("posts the body and returns a valid outcome", async () => {
    const outcome = {
      status: "ready",
      sourceRange: { fromMs: 0, toMs: 1 },
      reused: false
    };
    mockFetch.mockResolvedValue(reply(true, 200, outcome));
    await expect(isolateSubject("tl", { clip_id: "c" })).resolves.toEqual(
      outcome
    );
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/timelines/tl/isolate-subject");
    expect(JSON.parse(init.body)).toEqual({ clip_id: "c" });
  });

  it("rejects with the server detail", async () => {
    mockFetch.mockResolvedValue(reply(false, 404, { detail: "no clip" }));
    await expect(isolateSubject("tl", { clip_id: "c" })).rejects.toThrow(
      "no clip"
    );
  });

  it("falls back to the status when the error body is not JSON", async () => {
    mockFetch.mockResolvedValue(reply(false, 502, undefined));
    await expect(isolateSubject("tl", { clip_id: "c" })).rejects.toThrow(
      "Isolate subject failed (502)"
    );
  });

  it("rejects an unknown status", async () => {
    mockFetch.mockResolvedValue(reply(true, 200, { status: "weird" }));
    await expect(isolateSubject("tl", { clip_id: "c" })).rejects.toThrow(
      "Unexpected response"
    );
  });
});
