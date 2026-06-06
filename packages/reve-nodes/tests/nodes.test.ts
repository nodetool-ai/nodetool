import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateImageNode } from "../src/nodes/create-image.js";
import { EditImageNode } from "../src/nodes/edit-image.js";
import { RemixImageNode } from "../src/nodes/remix-image.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const FAKE_IMAGE_B64 = Buffer.from("fake-png-bytes").toString("base64");

function okImageResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      image: FAKE_IMAGE_B64,
      version: "reve-create@20250915",
      request_id: "req_test",
      credits_used: 1,
      credits_remaining: 99
    })
  };
}

function lastBody(): Record<string, unknown> {
  const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
  return JSON.parse(options.body as string) as Record<string, unknown>;
}

describe("Reve nodes", () => {
  const originalApiKey = process.env.REVE_API_KEY;

  beforeEach(() => {
    process.env.REVE_API_KEY = "test-key";
    mockFetch.mockResolvedValue(okImageResponse());
  });

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.REVE_API_KEY;
    else process.env.REVE_API_KEY = originalApiKey;
    mockFetch.mockReset();
  });

  describe("CreateImageNode", () => {
    it("posts to /v1/image/create and returns an ImageRef", async () => {
      const node = new CreateImageNode({ prompt: "a red panda", aspect_ratio: "16:9" });
      const result = await node.process();

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.reve.com/v1/image/create");
      expect((options.headers as Record<string, string>).Authorization).toBe(
        "Bearer test-key"
      );
      const body = lastBody();
      expect(body.prompt).toBe("a red panda");
      expect(body.aspect_ratio).toBe("16:9");
      expect(body.postprocessing).toBeUndefined(); // none → omitted

      expect(result.output).toMatchObject({
        type: "image",
        data: FAKE_IMAGE_B64,
        mimeType: "image/png"
      });
    });

    it("includes postprocessing when selected", async () => {
      const node = new CreateImageNode({
        prompt: "x",
        postprocessing: "upscale"
      });
      await node.process();
      expect(lastBody().postprocessing).toEqual(["upscale"]);
    });

    it("reads the API key from _secrets", async () => {
      delete process.env.REVE_API_KEY;
      const node = new CreateImageNode({ prompt: "x" });
      node.setDynamic("_secrets", { REVE_API_KEY: "from-secrets" });
      await node.process();
      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect((options.headers as Record<string, string>).Authorization).toBe(
        "Bearer from-secrets"
      );
    });

    it("throws when the prompt is empty", async () => {
      const node = new CreateImageNode({ prompt: "" });
      await expect(node.process()).rejects.toThrow("Prompt is required");
    });
  });

  describe("EditImageNode", () => {
    it("posts the reference image as base64 and the instruction", async () => {
      const node = new EditImageNode({
        edit_instruction: "make it night",
        image: { type: "image", data: FAKE_IMAGE_B64 }
      });
      const result = await node.process();

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.reve.com/v1/image/edit");
      const body = lastBody();
      expect(body.edit_instruction).toBe("make it night");
      expect(body.reference_image).toBe(FAKE_IMAGE_B64);
      // "none" aspect ratio is omitted so the reference ratio is kept.
      expect(body.aspect_ratio).toBeUndefined();
      expect(result.output).toMatchObject({ type: "image" });
    });

    it("forwards a chosen aspect ratio", async () => {
      const node = new EditImageNode({
        edit_instruction: "x",
        image: { type: "image", data: FAKE_IMAGE_B64 },
        aspect_ratio: "1:1"
      });
      await node.process();
      expect(lastBody().aspect_ratio).toBe("1:1");
    });

    it("throws when the instruction is empty", async () => {
      const node = new EditImageNode({
        edit_instruction: "",
        image: { type: "image", data: FAKE_IMAGE_B64 }
      });
      await expect(node.process()).rejects.toThrow("Edit instruction is required");
    });
  });

  describe("RemixImageNode", () => {
    it("posts multiple reference images as base64", async () => {
      const node = new RemixImageNode({
        prompt: "blend <img>0</img> and <img>1</img>",
        reference_images: [
          { type: "image", data: FAKE_IMAGE_B64 },
          { type: "image", data: FAKE_IMAGE_B64 }
        ]
      });
      await node.process();

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.reve.com/v1/image/remix");
      const body = lastBody();
      expect(body.prompt).toBe("blend <img>0</img> and <img>1</img>");
      expect(body.reference_images).toEqual([FAKE_IMAGE_B64, FAKE_IMAGE_B64]);
    });

    it("throws without reference images", async () => {
      const node = new RemixImageNode({ prompt: "x", reference_images: [] });
      await expect(node.process()).rejects.toThrow(
        "At least one reference image is required"
      );
    });

    it("throws with more than 6 reference images", async () => {
      const refs = Array.from({ length: 7 }, () => ({
        type: "image",
        data: FAKE_IMAGE_B64
      }));
      const node = new RemixImageNode({ prompt: "x", reference_images: refs });
      await expect(node.process()).rejects.toThrow("at most 6 reference images");
    });
  });
});
