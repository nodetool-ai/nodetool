/**
 * @jest-environment node
 */
import { createCloudFetch, CloudRequestError, type CloudRequester } from "../cloudFetch";
import type { CloudRequestInput, CloudResponse } from "../../../window";

const ORIGIN = "https://api.nodetool.ai";

function requester(answer: CloudResponse): jest.MockedFunction<CloudRequester> {
  return jest.fn(async (_input: CloudRequestInput) => answer);
}

describe("createCloudFetch", () => {
  it("sends the path, method, headers and body, and builds the response", async () => {
    const request = requester({
      ok: true,
      status: 200,
      headers: [["content-type", "application/json"]],
      body: new TextEncoder().encode('{"ok":1}')
    });
    const cloudFetch = createCloudFetch(ORIGIN, request);
    const response = await cloudFetch(`${ORIGIN}/trpc/workflows.list,workflows.get?batch=1`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-nodetool-protocol": "2" },
      body: '{"0":{}}'
    });
    expect(request).toHaveBeenCalledWith({
      method: "POST",
      path: "/trpc/workflows.list,workflows.get?batch=1",
      headers: { "content-type": "application/json", "x-nodetool-protocol": "2" },
      body: '{"0":{}}'
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.json()).toEqual({ ok: 1 });
  });

  it("refuses another origin, another method and an unsupported body without a request", async () => {
    const request = requester({ ok: false, error: "OFFLINE" });
    const cloudFetch = createCloudFetch(ORIGIN, request);
    await expect(cloudFetch("https://evil.example/trpc/x")).rejects.toThrow(CloudRequestError);
    await expect(cloudFetch(`${ORIGIN}/trpc/x`, { method: "DELETE" })).rejects.toThrow(CloudRequestError);
    await expect(
      cloudFetch(`${ORIGIN}/trpc/x`, { method: "POST", body: new URLSearchParams("a=b") })
    ).rejects.toThrow(CloudRequestError);
    expect(request).not.toHaveBeenCalled();
  });

  it("turns a refused call into an error with its code", async () => {
    const cloudFetch = createCloudFetch(ORIGIN, requester({ ok: false, error: "SIGNED_OUT" }));
    await expect(cloudFetch(`${ORIGIN}/trpc/x`)).rejects.toMatchObject({ code: "SIGNED_OUT" });
  });

  it("returns no body for HEAD and 304", async () => {
    const answer: CloudResponse = { ok: true, status: 304, headers: [], body: new Uint8Array([1]) };
    const response = await createCloudFetch(ORIGIN, requester(answer))(`${ORIGIN}/api/assets/a`);
    expect(response.status).toBe(304);
    expect(response.body).toBeNull();
  });

  it("rejects at once when aborted, without waiting for the answer", async () => {
    const request: CloudRequester = () => new Promise(() => {});
    const controller = new AbortController();
    const pending = createCloudFetch(ORIGIN, request)(`${ORIGIN}/trpc/x`, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
