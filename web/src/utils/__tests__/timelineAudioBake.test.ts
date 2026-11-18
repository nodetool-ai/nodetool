import { restFetch } from "../../lib/rest-fetch";
import { stub } from "../../test-utils/doubles";
import {
  AUDIO_DRIVE_MODES,
  AUDIO_DRIVE_PROPERTIES,
  bakeAudioAnimation,
  type BakeAudioAnimationBody
} from "../timelineAudioBake";

jest.mock("../../lib/rest-fetch", () => ({
  restFetch: jest.fn()
}));

const mockRestFetch = jest.mocked(restFetch);

function fakeResponse(ok: boolean, status: number, json: unknown): Response {
  return stub<Response>({
    ok,
    status,
    json: async () => {
      if (json === undefined) {
        throw new Error("not json");
      }
      return json;
    }
  });
}

const body: BakeAudioAnimationBody = {
  audio_clip_id: "a",
  target_clip_id: "v",
  property: "scale",
  output_range: [1, 1.2],
  mode: "envelope"
};

describe("bakeAudioAnimation", () => {
  beforeEach(() => mockRestFetch.mockReset());

  it("lists the drivable properties and modes", () => {
    expect([...AUDIO_DRIVE_PROPERTIES]).toEqual([
      "scale",
      "opacity",
      "offsetX",
      "offsetY"
    ]);
    expect([...AUDIO_DRIVE_MODES]).toEqual(["envelope", "beats"]);
  });

  it("posts the body to the encoded timeline path and returns the result", async () => {
    const result = { updated_at: "2026-01-01", keyframeCount: 4 };
    mockRestFetch.mockResolvedValue(fakeResponse(true, 200, result));

    await expect(bakeAudioAnimation("a b", body)).resolves.toEqual(result);

    expect(mockRestFetch).toHaveBeenCalledWith(
      "/api/timelines/a%20b/bake-audio-animation",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      }
    );
  });

  it("throws the server's detail on a failed response", async () => {
    mockRestFetch.mockResolvedValue(
      fakeResponse(false, 400, { detail: "bad clip" })
    );
    await expect(bakeAudioAnimation("t", body)).rejects.toThrow("bad clip");
  });

  it("falls back to the status code when the error body is not JSON", async () => {
    mockRestFetch.mockResolvedValue(fakeResponse(false, 502, undefined));
    await expect(bakeAudioAnimation("t", body)).rejects.toThrow(
      "Bake failed (502)"
    );
  });

  it("rejects a success response missing the expected fields", async () => {
    mockRestFetch.mockResolvedValue(
      fakeResponse(true, 200, { updated_at: "x", keyframeCount: "4" })
    );
    await expect(bakeAudioAnimation("t", body)).rejects.toThrow(
      "Unexpected response from the audio bake endpoint"
    );
  });
});
