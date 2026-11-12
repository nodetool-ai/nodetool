/**
 * lib.comfy.RunWorkflowOnCloud failed with "Missing or invalid API key. Send
 * 'Authorization: Bearer <your comfyui- key>'" while the comfy_cloud provider
 * ran on the same key. Comfy Cloud answers a job with `http://cloud.comfy.org`
 * links. The SDK treats that as a foreign origin and polls it with no key.
 * The provider wraps the SDK's fetch to restore https and the key; the node's
 * transport did not. The fake server below answers the way Comfy Cloud does.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cloudTransport } from "../src/nodes/comfy-sdk.js";

const KEY = "comfyui-test-key";
const JOB_ID = "6b2f4e8a-1c3d-4f5e-9a7b-0c1d2e3f4a5b";

function jobModel(status: string) {
  return {
    id: JOB_ID,
    status,
    outputs: [],
    error: null,
    urls: {
      self: `http://cloud.comfy.org/api/v2/jobs/${JOB_ID}`,
      cancel: `http://cloud.comfy.org/api/v2/jobs/${JOB_ID}/cancel`,
      events: `http://cloud.comfy.org/api/v2/jobs/${JOB_ID}/events`
    }
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("Comfy Cloud transport of the RunWorkflowOnCloud node", () => {
  it("polls the job with the configured key", async () => {
    const seen: Array<{ method: string; url: string; auth: string | null }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(String(input), init);
        const auth = request.headers.get("authorization");
        seen.push({ method: request.method, url: request.url, auth });
        if (!request.url.startsWith("https://cloud.comfy.org/") || auth !== `Bearer ${KEY}`) {
          return Response.json(
            {
              error: {
                code: "unauthorized",
                message:
                  "Missing or invalid API key. Send 'Authorization: Bearer <your comfyui- key>'"
              }
            },
            { status: 401 }
          );
        }
        if (request.method === "POST") {
          return Response.json(jobModel("queued"), { status: 201 });
        }
        return Response.json(jobModel("succeeded"));
      })
    );

    const job = await cloudTransport(KEY).submit(
      { "9": { class_type: "SaveImage", inputs: {} } },
      { signal: AbortSignal.timeout(10_000) }
    );
    const finished = await (job as unknown as { refresh(): Promise<{ status: string }> }).refresh();

    expect(finished.status).toBe("succeeded");
    expect(seen.map(({ method, url, auth }) => ({ method, url, auth }))).toEqual([
      { method: "POST", url: "https://cloud.comfy.org/api/v2/jobs", auth: `Bearer ${KEY}` },
      { method: "GET", url: `https://cloud.comfy.org/api/v2/jobs/${JOB_ID}`, auth: `Bearer ${KEY}` }
    ]);
  });
});
