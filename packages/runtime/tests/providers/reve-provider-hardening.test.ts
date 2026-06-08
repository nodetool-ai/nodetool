/**
 * Mutation-hardening for ReveProvider: api-key guard, image model list, the
 * create/edit POST (URL, headers, body, error/violation/no-image/decoding),
 * aspect-ratio whitelist, and chat-unsupported generators. Uses a stubbed
 * global fetch. See MUTATION_TESTING.md.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { ReveProvider } from "../../src/providers/reve-provider.js";

const img = { id: "m", name: "m", provider: "reve" as const };
let fetchSpy: ReturnType<typeof vi.fn>;
afterEach(() => vi.restoreAllMocks());

function stub(res: unknown) {
  fetchSpy = vi.fn().mockResolvedValue(res);
  vi.stubGlobal("fetch", fetchSpy);
}
const okJson = (body: unknown) => ({ ok: true, json: async () => body });
const make = (key: unknown = "k") =>
  new ReveProvider({ REVE_API_KEY: key } as Record<string, unknown>);

describe("ReveProvider basics", () => {
  it("declares the secret and container env", () => {
    expect(ReveProvider.requiredSecrets()).toEqual(["REVE_API_KEY"]);
    expect(make("tok").getContainerEnv()).toEqual({ REVE_API_KEY: "tok" });
  });

  it("rejects chat generation (both entry points)", async () => {
    await expect(make().generateMessage({ messages: [], model: "x" } as never)).rejects.toThrow(
      "does not support chat"
    );
    await expect(
      make().generateMessages({ messages: [], model: "x" } as never).next()
    ).rejects.toThrow("does not support chat");
  });

  it("lists image models only when a key is set", async () => {
    expect(await make("").getAvailableImageModels()).toEqual([]);
    expect(await make("k").getAvailableImageModels()).toEqual([
      { id: "reve-create", name: "Reve Create", provider: "reve", supportedTasks: ["text_to_image"] },
      { id: "reve-edit", name: "Reve Edit", provider: "reve", supportedTasks: ["image_to_image"] }
    ]);
  });

  it("requires a non-blank api key at call time", async () => {
    stub(okJson({ image: "AQID" }));
    await expect(
      make("   ").textToImage({ model: img, prompt: "x" } as never)
    ).rejects.toThrow("REVE_API_KEY is not configured");
  });
});

describe("ReveProvider.textToImage", () => {
  it("POSTs to /v1/image/create with the documented headers and body", async () => {
    stub(okJson({ image: "AQID" }));
    const out = await make("tok").textToImage({
      model: img,
      prompt: "a cat",
      aspectRatio: "16:9"
    } as never);
    expect(Array.from(out)).toEqual([1, 2, 3]); // base64 AQID decoded
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.reve.com/v1/image/create");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: "Bearer tok",
      "Content-Type": "application/json",
      Accept: "application/json"
    });
    expect(JSON.parse(init.body)).toEqual({ prompt: "a cat", aspect_ratio: "16:9" });
  });

  it("drops an invalid aspect ratio", async () => {
    stub(okJson({ image: "AQID" }));
    await make("tok").textToImage({ model: img, prompt: "p", aspectRatio: "5:1" } as never);
    expect("aspect_ratio" in JSON.parse(fetchSpy.mock.calls[0][1].body)).toBe(false);
  });

  it("accepts every whitelisted aspect ratio", async () => {
    for (const ar of ["16:9", "9:16", "3:2", "2:3", "4:3", "3:4", "1:1"]) {
      stub(okJson({ image: "AQID" }));
      await make("tok").textToImage({ model: img, prompt: "p", aspectRatio: ar } as never);
      expect(JSON.parse(fetchSpy.mock.calls[0][1].body).aspect_ratio).toBe(ar);
    }
  });
});

describe("ReveProvider.imageToImage", () => {
  it("rejects an empty image", async () => {
    stub(okJson({ image: "AQID" }));
    await expect(
      make("tok").imageToImage(new Uint8Array([]), { model: img, prompt: "p" } as never)
    ).rejects.toThrow("image must not be empty");
  });

  it("drops an invalid aspect ratio on edit too", async () => {
    stub(okJson({ image: "AQID" }));
    await make("tok").imageToImage(new Uint8Array([1]), {
      model: img,
      prompt: "p",
      aspectRatio: "5:1"
    } as never);
    expect("aspect_ratio" in JSON.parse(fetchSpy.mock.calls[0][1].body)).toBe(false);
  });

  it("POSTs to /v1/image/edit with the base64 reference image and edit instruction", async () => {
    stub(okJson({ image: "AQID" }));
    await make("tok").imageToImage(new Uint8Array([1, 2, 3]), {
      model: img,
      prompt: "make it blue",
      aspectRatio: "1:1"
    } as never);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.reve.com/v1/image/edit");
    expect(JSON.parse(init.body)).toEqual({
      edit_instruction: "make it blue",
      reference_image: "AQID",
      aspect_ratio: "1:1"
    });
  });
});

describe("ReveProvider.post error handling", () => {
  it("throws with status and body on a non-ok response", async () => {
    fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });
    vi.stubGlobal("fetch", fetchSpy);
    await expect(
      make("tok").textToImage({ model: img, prompt: "p" } as never)
    ).rejects.toThrow("Reve create failed: 500 boom");
  });

  it("throws on a content-policy violation", async () => {
    stub(okJson({ content_violation: true }));
    await expect(
      make("tok").textToImage({ model: img, prompt: "p" } as never)
    ).rejects.toThrow("content policy violation");
  });

  it("throws when no image is returned", async () => {
    stub(okJson({ request_id: "r1" }));
    await expect(
      make("tok").textToImage({ model: img, prompt: "p" } as never)
    ).rejects.toThrow("Reve returned no image");
  });
});
