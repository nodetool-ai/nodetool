import { restFetch } from "../../lib/rest-fetch";
import { stub } from "../../test-utils/doubles";
import { isolateSubject } from "../timelineIsolateSubject";

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

const body = { clip_id: "c1", provider: "p", model: "m" };

describe("isolateSubject", () => {
  beforeEach(() => mockRestFetch.mockReset());

  it("posts the body to the encoded timeline path and returns the outcome", async () => {
    const result = {
      status: "ready",
      sourceRange: { fromMs: 0, toMs: 10 },
      reused: false
    };
    mockRestFetch.mockResolvedValue(fakeResponse(true, 200, result));

    await expect(isolateSubject("a/b", body)).resolves.toEqual(result);

    expect(mockRestFetch).toHaveBeenCalledWith(
      "/api/timelines/a%2Fb/isolate-subject",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      }
    );
  });

  it("accepts a generating status from a background run", async () => {
    const result = {
      status: "generating",
      sourceRange: { fromMs: 0, toMs: 1 },
      reused: false
    };
    mockRestFetch.mockResolvedValue(fakeResponse(true, 200, result));
    await expect(
      isolateSubject("t", { ...body, background: true })
    ).resolves.toMatchObject({ status: "generating" });
  });

  it("throws the server's detail on a failed response", async () => {
    mockRestFetch.mockResolvedValue(
      fakeResponse(false, 422, { detail: "no audio" })
    );
    await expect(isolateSubject("t", body)).rejects.toThrow("no audio");
  });

  it("falls back to the status code when the error body has no detail", async () => {
    mockRestFetch.mockResolvedValue(fakeResponse(false, 500, undefined));
    await expect(isolateSubject("t", body)).rejects.toThrow(
      "Isolate subject failed (500)"
    );
  });

  it("rejects a success response with an unknown status", async () => {
    mockRestFetch.mockResolvedValue(
      fakeResponse(true, 200, { status: "weird" })
    );
    await expect(isolateSubject("t", body)).rejects.toThrow(
      "Unexpected response from the isolate-subject endpoint"
    );
  });
});
