import { describe, it, expect, vi, afterEach } from "vitest";
import { ReveProvider } from "../../src/providers/reve-provider.js";
import type { ImageModel } from "../../src/providers/types.js";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

const FAKE_IMAGE_B64 = Buffer.from("fake-png").toString("base64");
const CREATE_MODEL: ImageModel = {
  id: "reve-create",
  name: "Reve Create",
  provider: "reve"
};
const EDIT_MODEL: ImageModel = {
  id: "reve-edit",
  name: "Reve Edit",
  provider: "reve"
};

function mockOkImage(): typeof fetch {
  const fn = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ image: FAKE_IMAGE_B64, request_id: "r" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })
  );
  global.fetch = fn as unknown as typeof fetch;
  return fn as unknown as typeof fetch;
}

describe("ReveProvider — metadata", () => {
  it("reports provider id and required secrets", () => {
    const p = new ReveProvider({ REVE_API_KEY: "k" });
    expect(p.provider).toBe("reve");
    expect(ReveProvider.requiredSecrets()).toEqual(["REVE_API_KEY"]);
  });

  it("getContainerEnv exposes the API key", () => {
    const p = new ReveProvider({ REVE_API_KEY: "k" });
    expect(p.getContainerEnv()).toEqual({ REVE_API_KEY: "k" });
  });

  it("chat generation throws (not supported)", async () => {
    const p = new ReveProvider({ REVE_API_KEY: "k" });
    await expect(
      p.generateMessage({ messages: [], model: "x" } as never)
    ).rejects.toThrow("does not support chat generation");
  });
});

describe("ReveProvider — getAvailableImageModels", () => {
  it("returns no models without an API key", async () => {
    const p = new ReveProvider({});
    expect(await p.getAvailableImageModels()).toEqual([]);
  });

  it("exposes create (text→image) and edit (image→image) models", async () => {
    const p = new ReveProvider({ REVE_API_KEY: "k" });
    const models = await p.getAvailableImageModels();
    expect(models.map((m) => m.id)).toEqual(["reve-create", "reve-edit"]);
    expect(models[0].supportedTasks).toEqual(["text_to_image"]);
    expect(models[1].supportedTasks).toEqual(["image_to_image"]);
  });
});

describe("ReveProvider — generation", () => {
  it("textToImage posts to /v1/image/create and decodes the base64 image", async () => {
    const fetchMock = mockOkImage();
    const p = new ReveProvider({ REVE_API_KEY: "secret" });
    const bytes = await p.textToImage({
      model: CREATE_MODEL,
      prompt: "a fox",
      aspectRatio: "16:9"
    });

    expect(Buffer.from(bytes).toString()).toBe("fake-png");
    const [url, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toBe("https://api.reve.com/v1/image/create");
    expect((init as RequestInit).method).toBe("POST");
    expect(
      ((init as RequestInit).headers as Record<string, string>).Authorization
    ).toBe("Bearer secret");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ prompt: "a fox", aspect_ratio: "16:9" });
  });

  it("imageToImage posts to /v1/image/edit with a base64 reference image", async () => {
    const fetchMock = mockOkImage();
    const p = new ReveProvider({ REVE_API_KEY: "secret" });
    const input = Uint8Array.from([1, 2, 3, 4]);
    await p.imageToImage([input], { model: EDIT_MODEL, prompt: "make it blue" });

    const [url, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toBe("https://api.reve.com/v1/image/edit");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.edit_instruction).toBe("make it blue");
    expect(body.reference_image).toBe(Buffer.from(input).toString("base64"));
  });

  it("imageToImage posts to /v1/image/remix with N reference images when given multiple", async () => {
    const fetchMock = mockOkImage();
    const p = new ReveProvider({ REVE_API_KEY: "secret" });
    const inputs = [
      Uint8Array.from([1, 2]),
      Uint8Array.from([3, 4]),
      Uint8Array.from([5, 6])
    ];
    await p.imageToImage(inputs, {
      model: EDIT_MODEL,
      prompt: "blend these",
      aspectRatio: "1:1"
    });

    const [url, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toBe("https://api.reve.com/v1/image/remix");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.prompt).toBe("blend these");
    expect(body.aspect_ratio).toBe("1:1");
    expect(body.reference_image).toBeUndefined();
    expect(body.reference_images).toEqual(
      inputs.map((b) => Buffer.from(b).toString("base64"))
    );
  });

  it("imageToImage throws when given more than 6 reference images", async () => {
    const p = new ReveProvider({ REVE_API_KEY: "k" });
    const inputs = Array.from({ length: 7 }, (_, i) =>
      Uint8Array.from([i + 1])
    );
    await expect(
      p.imageToImage(inputs, { model: EDIT_MODEL, prompt: "too many" })
    ).rejects.toThrow("Reve accepts at most 6 reference images, got 7.");
  });

  it("textToImage throws on an API error", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response("denied", { status: 402 })) as never;
    const p = new ReveProvider({ REVE_API_KEY: "k" });
    await expect(
      p.textToImage({ model: CREATE_MODEL, prompt: "x" })
    ).rejects.toThrow("Reve create failed: 402");
  });

  it("imageToImage rejects an empty image", async () => {
    const p = new ReveProvider({ REVE_API_KEY: "k" });
    await expect(
      p.imageToImage([new Uint8Array()], { model: EDIT_MODEL, prompt: "x" })
    ).rejects.toThrow("image must not be empty");
  });
});
