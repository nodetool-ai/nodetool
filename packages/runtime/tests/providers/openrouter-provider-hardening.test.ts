/**
 * Mutation-hardening for OpenRouterProvider: default client baseURL, the image
 * model catalog, reasoning-model system→user conversion (for a model the parent
 * does NOT also convert), textToImage size/quality/url/no-data branches, and
 * language-model row filtering. See MUTATION_TESTING.md.
 */
import { describe, it, expect, vi } from "vitest";
import { OpenRouterProvider } from "../../src/providers/openrouter-provider.js";
import type { Message, TextToImageParams } from "../../src/providers/types.js";
import {
  chatJsonResponse,
  mockChatFetch,
  requestBodyOf
} from "./helpers/compat-fetch.js";

const make = (opts?: object) =>
  new OpenRouterProvider({ OPENROUTER_API_KEY: "k" }, opts as never);

const imageModel = (id = "openrouter/img") => ({
  id,
  name: "img",
  provider: "openrouter" as const
});

describe("OpenRouterProvider hardening", () => {
  it("builds a client at the OpenRouter base URL by default", () => {
    expect((make() as unknown as { getClient: () => { baseURL: string } }).getClient().baseURL).toBe(
      "https://openrouter.ai/api/v1"
    );
  });

  it("exposes the SDXL image model with its text_to_image task", async () => {
    const models = await make({ client: {} }).getAvailableImageModels();
    expect(models).toEqual([
      {
        id: "stabilityai/stable-diffusion-xl",
        name: "Stable Diffusion XL",
        provider: "openrouter",
        supportedTasks: ["text_to_image"]
      }
    ]);
  });

  describe("reasoning-model system→user conversion (parent does not cover non-'o' prefixes)", () => {
    // A model that does NOT start with "o" (so OpenAIProvider's own converter is
    // inert) but contains "o1" — only OpenRouter's convertSystem handles it.
    const captureSent = async (model: string, content: unknown) => {
      const fetchMock = mockChatFetch(
        chatJsonResponse({
          choices: [{ message: { content: "ok", tool_calls: null } }]
        })
      );
      const p = make({ fetchFn: fetchMock });
      await p.generateMessage({
        messages: [{ role: "system", content } as Message],
        model
      });
      const sent = requestBodyOf(fetchMock).messages as Array<{
        role: string;
        content: string;
      }>;
      return sent[0];
    };

    it("converts a system message for a non-'o' model containing o1", async () => {
      const sent = await captureSent("grok-o1", "Be nice.");
      expect(sent.role).toBe("user");
      expect(sent.content).toBe("Instructions: Be nice.");
    });

    it("is case-insensitive about the o1/o3 marker", async () => {
      const sent = await captureSent("GROK-O1", "Hi");
      expect(sent.role).toBe("user");
    });

    it("renders non-string system content as an empty instruction body", async () => {
      const sent = await captureSent("grok-o1", [{ type: "text", text: "x" }]);
      expect(sent.content).toBe("Instructions: ");
    });

    it("leaves a plain model's system message untouched", async () => {
      const sent = await captureSent("meta/llama-3", "stay");
      expect(sent.role).toBe("system");
    });

    it("converts ONLY system messages, leaving user messages intact", async () => {
      const fetchMock = mockChatFetch(
        chatJsonResponse({
          choices: [{ message: { content: "ok", tool_calls: null } }]
        })
      );
      const p = make({ fetchFn: fetchMock });
      await p.generateMessage({
        messages: [
          { role: "system", content: "sys" } as Message,
          { role: "user", content: "hi" } as Message
        ],
        model: "grok-o1"
      });
      const sent = requestBodyOf(fetchMock).messages as Array<{
        role: string;
        content: string;
      }>;
      expect(sent[0].role).toBe("user");
      expect(sent[0].content).toBe("Instructions: sys");
      expect(sent[1].role).toBe("user");
      expect(sent[1].content).toBe("hi"); // untouched, no "Instructions:" prefix
    });
  });

  describe("textToImage", () => {
    const withImage = (genResult: unknown, fetchFn?: unknown) =>
      make({
        client: { images: { generate: vi.fn().mockResolvedValue(genResult) } },
        ...(fetchFn ? { fetchFn } : {})
      });

    it("passes resolved size and quality through to the images API", async () => {
      const generate = vi
        .fn()
        .mockResolvedValue({ data: [{ b64_json: Buffer.from("x").toString("base64") }] });
      const p = make({ client: { images: { generate } } });
      await p.textToImage({
        model: imageModel(),
        prompt: "a cat",
        width: 1024,
        height: 1024,
        quality: "hd"
      } as TextToImageParams);
      const req = generate.mock.calls[0][0];
      expect(req.size).toBe("1024x1024");
      expect(req.quality).toBe("hd");
    });

    it("omits size and quality when not provided", async () => {
      const generate = vi
        .fn()
        .mockResolvedValue({ data: [{ b64_json: Buffer.from("x").toString("base64") }] });
      const p = make({ client: { images: { generate } } });
      await p.textToImage({ model: imageModel(), prompt: "a cat" } as TextToImageParams);
      const req = generate.mock.calls[0][0];
      expect("size" in req).toBe(false);
      expect("quality" in req).toBe(false);
    });

    it("combines prompt and trimmed negative prompt", async () => {
      const generate = vi
        .fn()
        .mockResolvedValue({ data: [{ b64_json: Buffer.from("x").toString("base64") }] });
      const p = make({ client: { images: { generate } } });
      await p.textToImage({
        model: imageModel(),
        prompt: "  scene  ",
        negativePrompt: "  blur  "
      } as TextToImageParams);
      expect(generate.mock.calls[0][0].prompt).toBe(
        "scene\n\nDo not include: blur"
      );
    });

    it("decodes b64_json image bytes exactly", async () => {
      const generate = vi
        .fn()
        .mockResolvedValue({ data: [{ b64_json: "AQID" }] }); // base64 of [1,2,3]
      const p = make({ client: { images: { generate } } });
      const out = await p.textToImage({
        model: imageModel(),
        prompt: "x"
      } as TextToImageParams);
      expect(Array.from(out)).toEqual([1, 2, 3]);
    });

    it("throws when the response has no data array at all", async () => {
      const p = withImage({}); // data is undefined → pins the `?.[0]`
      await expect(
        p.textToImage({ model: imageModel(), prompt: "x" } as TextToImageParams)
      ).rejects.toThrow("OpenRouter image generation returned no image data.");
    });

    it("throws when the API returns an empty data array", async () => {
      const p = withImage({ data: [] });
      await expect(
        p.textToImage({ model: imageModel(), prompt: "x" } as TextToImageParams)
      ).rejects.toThrow("OpenRouter image generation returned no image data.");
    });

    it("throws when the item has neither b64 nor url", async () => {
      const p = withImage({ data: [{}] });
      await expect(
        p.textToImage({ model: imageModel(), prompt: "x" } as TextToImageParams)
      ).rejects.toThrow("returned no image data");
    });

    it("fetches the url and errors on a non-ok image response", async () => {
      const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 503 });
      const p = withImage({ data: [{ url: "https://img/x.png" }] }, fetchFn);
      await expect(
        p.textToImage({ model: imageModel(), prompt: "x" } as TextToImageParams)
      ).rejects.toThrow("Image fetch failed: 503");
    });
  });

  describe("getAvailableLanguageModels", () => {
    it("keeps only non-empty string ids, name falling back to id", async () => {
      const fetchFn = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: "a", name: "A" }, { id: "b" }, { id: "" }, { name: "no" }]
        })
      });
      const p = make({ client: {}, fetchFn });
      expect(await p.getAvailableLanguageModels()).toEqual([
        { id: "a", name: "A", provider: "openrouter" },
        { id: "b", name: "b", provider: "openrouter" }
      ]);
    });

    it("returns [] for a not-ok models response carrying a body", async () => {
      const fetchFn = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ data: [{ id: "x" }] })
      });
      const p = make({ client: {}, fetchFn });
      expect(await p.getAvailableLanguageModels()).toEqual([]);
    });
  });
});
