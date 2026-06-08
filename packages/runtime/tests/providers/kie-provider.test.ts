import { describe, it, expect, vi, afterEach } from "vitest";
import { KieProvider } from "../../src/providers/kie-provider.js";
import type {
  ImageToImageParams,
  ImageToVideoParams
} from "../../src/providers/types.js";

/**
 * Routes the KIE HTTP flow (upload → createTask → recordInfo → download) to
 * canned responses keyed by URL. Captures the createTask request bodies so
 * tests can assert the `image_urls` mapping.
 */
function mockKieFlow(uploadUrls: string[]) {
  const createdInputs: Array<Record<string, unknown>> = [];
  let uploadIdx = 0;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("file-stream-upload")) {
      const downloadUrl = uploadUrls[uploadIdx++];
      return jsonResponse({ success: true, data: { downloadUrl } });
    }
    if (u.includes("/jobs/createTask")) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      createdInputs.push(body.input as Record<string, unknown>);
      return jsonResponse({ data: { taskId: "task-1" } });
    }
    if (u.includes("/jobs/recordInfo")) {
      return jsonResponse({
        data: {
          state: "success",
          resultJson: JSON.stringify({
            resultUrls: ["https://kie.result/out.png"]
          })
        }
      });
    }
    // Final asset download.
    return {
      ok: true,
      arrayBuffer: async () => new Uint8Array([7, 7, 7]).buffer
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, createdInputs };
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("KieProvider — imageToImage", () => {
  it("uploads every image and submits them as image_urls", async () => {
    const { createdInputs } = mockKieFlow([
      "https://kie.cdn/a.png",
      "https://kie.cdn/b.png"
    ]);
    const provider = new KieProvider({ KIE_API_KEY: "k" });

    const params: ImageToImageParams = {
      model: { id: "bytedance/seedream-v4-edit", name: "Seedream", provider: "kie" },
      prompt: "merge the two"
    };
    const result = await provider.imageToImage(
      [new Uint8Array([1, 2]), new Uint8Array([3, 4])],
      params
    );

    expect(result).toEqual(new Uint8Array([7, 7, 7]));
    expect(createdInputs[0].image_urls).toEqual([
      "https://kie.cdn/a.png",
      "https://kie.cdn/b.png"
    ]);
    expect(createdInputs[0].prompt).toBe("merge the two");
  });

  it("throws when no image bytes are supplied", async () => {
    mockKieFlow([]);
    const provider = new KieProvider({ KIE_API_KEY: "k" });
    await expect(
      provider.imageToImage([new Uint8Array()], {
        model: { id: "m", name: "m", provider: "kie" },
        prompt: "x"
      })
    ).rejects.toThrow("input image is empty");
  });
});

describe("KieProvider — imageToVideo", () => {
  it("uploads images and submits them as image_urls", async () => {
    const { createdInputs } = mockKieFlow(["https://kie.cdn/frame.png"]);
    const provider = new KieProvider({ KIE_API_KEY: "k" });

    const params: ImageToVideoParams = {
      model: { id: "kling/v2", name: "Kling", provider: "kie" },
      prompt: "pan left",
      durationSeconds: 5
    };
    const result = await provider.imageToVideo([new Uint8Array([9])], params);

    expect(result).toEqual(new Uint8Array([7, 7, 7]));
    expect(createdInputs[0].image_urls).toEqual(["https://kie.cdn/frame.png"]);
    expect(createdInputs[0].prompt).toBe("pan left");
    expect(createdInputs[0].duration).toBe(5);
  });
});
