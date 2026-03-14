import { test, expect } from "@playwright/test";
import { BACKEND_API_URL } from "./support/backend";

/**
 * Model API tests against the real TS backend.
 * These verify provider-specific model endpoints,
 * covering the consumer hooks:
 *   - useProviders (GET /api/models/providers)
 *   - useModelsByProvider (GET /api/models/llm/{provider}, etc.)
 *   - useOllamaModels (GET /api/models/llm/ollama)
 *   - Recommended model hooks
 */

// Skip when executed by Jest
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Models API (Real Backend)", () => {
    test.describe("Providers endpoint", () => {
      test("should list all available providers", async ({ request }) => {
        const res = await request.get(`${BACKEND_API_URL}/models/providers`);
        expect(res.status()).toBe(200);

        const providers = await res.json();
        expect(Array.isArray(providers)).toBe(true);
        expect(providers.length).toBeGreaterThan(0);

        // Each provider should have required fields
        for (const provider of providers) {
          expect(provider).toHaveProperty("provider");
          expect(typeof provider.provider).toBe("string");
          expect(provider).toHaveProperty("capabilities");
          expect(Array.isArray(provider.capabilities)).toBe(true);
        }
      });

      test("should include well-known providers", async ({ request }) => {
        const res = await request.get(`${BACKEND_API_URL}/models/providers`);
        const providers = await res.json();

        const providerIds = providers.map(
          (p: { provider: string }) => p.provider
        );
        // At minimum, OpenAI and Anthropic should be listed
        expect(providerIds).toContain("openai");
        expect(providerIds).toContain("anthropic");
      });

      test("should have capabilities arrays for each provider", async ({
        request
      }) => {
        const res = await request.get(`${BACKEND_API_URL}/models/providers`);
        const providers = await res.json();

        for (const provider of providers) {
          expect(provider.capabilities.length).toBeGreaterThan(0);
          // Capabilities should be strings
          for (const cap of provider.capabilities) {
            expect(typeof cap).toBe("string");
          }
        }
      });
    });

    test.describe("LLM model endpoints", () => {
      test("should list OpenAI LLM models", async ({ request }) => {
        const res = await request.get(
          `${BACKEND_API_URL}/models/llm/openai`
        );
        expect(res.status()).toBe(200);

        const models = await res.json();
        expect(Array.isArray(models)).toBe(true);
        expect(models.length).toBeGreaterThan(0);

        // Each model should have id and name
        const first = models[0];
        expect(first).toHaveProperty("id");
        expect(first).toHaveProperty("name");
      });

      test("should list Anthropic LLM models", async ({ request }) => {
        const res = await request.get(
          `${BACKEND_API_URL}/models/llm/anthropic`
        );
        expect(res.status()).toBe(200);

        const models = await res.json();
        expect(Array.isArray(models)).toBe(true);
        expect(models.length).toBeGreaterThan(0);
      });

      test("should return empty array for Ollama when not running", async ({
        request
      }) => {
        const res = await request.get(
          `${BACKEND_API_URL}/models/llm/ollama`
        );
        // Should succeed even if Ollama is not running
        expect([200, 500]).toContain(res.status());

        if (res.status() === 200) {
          const models = await res.json();
          expect(Array.isArray(models)).toBe(true);
        }
      });
    });

    test.describe("Image model endpoints", () => {
      test("should list image models for a provider", async ({ request }) => {
        // First get providers that support image generation
        const providersRes = await request.get(
          `${BACKEND_API_URL}/models/providers`
        );
        const providers = await providersRes.json();

        const imageProviders = providers.filter(
          (p: { capabilities: string[] }) =>
            p.capabilities.includes("text_to_image") ||
            p.capabilities.includes("image_generation")
        );

        if (imageProviders.length === 0) {
          test.skip(true, "No image providers available");
          return;
        }

        const provider = imageProviders[0].provider;
        const res = await request.get(
          `${BACKEND_API_URL}/models/image/${provider}`
        );
        expect(res.status()).toBe(200);

        const models = await res.json();
        expect(Array.isArray(models)).toBe(true);
      });
    });

    test.describe("TTS model endpoints", () => {
      test("should list TTS models for a provider", async ({ request }) => {
        const providersRes = await request.get(
          `${BACKEND_API_URL}/models/providers`
        );
        const providers = await providersRes.json();

        const ttsProviders = providers.filter(
          (p: { capabilities: string[] }) =>
            p.capabilities.includes("text_to_speech")
        );

        if (ttsProviders.length === 0) {
          test.skip(true, "No TTS providers available");
          return;
        }

        const provider = ttsProviders[0].provider;
        const res = await request.get(
          `${BACKEND_API_URL}/models/tts/${provider}`
        );
        expect(res.status()).toBe(200);

        const models = await res.json();
        expect(Array.isArray(models)).toBe(true);
      });
    });

    test.describe("ASR model endpoints", () => {
      test("should list ASR models for a provider", async ({ request }) => {
        const providersRes = await request.get(
          `${BACKEND_API_URL}/models/providers`
        );
        const providers = await providersRes.json();

        const asrProviders = providers.filter(
          (p: { capabilities: string[] }) =>
            p.capabilities.includes("speech_to_text") ||
            p.capabilities.includes("speech_recognition")
        );

        if (asrProviders.length === 0) {
          test.skip(true, "No ASR providers available");
          return;
        }

        const provider = asrProviders[0].provider;
        const res = await request.get(
          `${BACKEND_API_URL}/models/asr/${provider}`
        );
        expect(res.status()).toBe(200);

        const models = await res.json();
        expect(Array.isArray(models)).toBe(true);
      });
    });

    test.describe("All models endpoint", () => {
      test("should list all models", async ({ request }) => {
        const res = await request.get(`${BACKEND_API_URL}/models/all`);
        expect(res.status()).toBe(200);

        const models = await res.json();
        expect(Array.isArray(models)).toBe(true);
        expect(models.length).toBeGreaterThan(0);

        // Each model should have basic fields
        const first = models[0];
        expect(first).toHaveProperty("id");
        expect(first).toHaveProperty("name");
      });
    });

    test.describe("Recommended models", () => {
      test("should list recommended models", async ({ request }) => {
        const res = await request.get(
          `${BACKEND_API_URL}/models/recommended`
        );
        expect(res.status()).toBe(200);

        const models = await res.json();
        expect(Array.isArray(models)).toBe(true);
      });

      test("should list recommended language models", async ({ request }) => {
        const res = await request.get(
          `${BACKEND_API_URL}/models/recommended/language`
        );
        expect(res.status()).toBe(200);

        const models = await res.json();
        expect(Array.isArray(models)).toBe(true);
      });

      test("should list recommended image models", async ({ request }) => {
        const res = await request.get(
          `${BACKEND_API_URL}/models/recommended/image`
        );
        expect(res.status()).toBe(200);

        const models = await res.json();
        expect(Array.isArray(models)).toBe(true);
      });
    });

    test.describe("HuggingFace models", () => {
      test("should list HuggingFace models", async ({ request }) => {
        const res = await request.get(
          `${BACKEND_API_URL}/models/huggingface`
        );
        expect(res.status()).toBe(200);

        const models = await res.json();
        expect(Array.isArray(models)).toBe(true);
      });

      test("should check HuggingFace cache status", async ({ request }) => {
        const res = await request.post(
          `${BACKEND_API_URL}/models/huggingface/check_cache`,
          {
            data: {
              items: [
                { key: "test-model/test-repo" }
              ]
            }
          }
        );
        expect(res.status()).toBe(200);

        const results = await res.json();
        expect(Array.isArray(results)).toBe(true);
      });
    });
  });
}
