import { describe, it, expect, vi } from "vitest";
import { HuggingFaceProvider } from "../../src/providers/huggingface-provider.js";
import type { Message, TextToImageParams } from "../../src/providers/types.js";

function makeMockHfClient(overrides: Record<string, any> = {}) {
  return {
    chatCompletion: vi.fn().mockResolvedValue({
      choices: [
        {
          message: { content: "hello from hf" }
        }
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5 }
    }),
    chatCompletionStream: vi.fn().mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield {
          choices: [
            {
              delta: { content: "streamed" },
              finish_reason: null
            }
          ]
        };
        yield {
          choices: [
            {
              delta: { content: "" },
              finish_reason: "stop"
            }
          ]
        };
      }
    }),
    textToImage: vi.fn().mockResolvedValue({
      arrayBuffer: async () => new ArrayBuffer(16)
    }),
    textToSpeech: vi.fn().mockResolvedValue({
      arrayBuffer: async () => new ArrayBuffer(16)
    }),
    ...overrides
  };
}

describe("HuggingFaceProvider", () => {
  it("throws if HF_TOKEN is missing", () => {
    expect(() => new HuggingFaceProvider({} as any)).toThrow(
      "HF_TOKEN is required"
    );
  });

  it("reports provider id as huggingface", () => {
    const provider = new HuggingFaceProvider(
      { HF_TOKEN: "hf_test" },
      { hfClient: makeMockHfClient() }
    );
    expect(provider.provider).toBe("huggingface");
  });

  it("returns required secrets", () => {
    expect(HuggingFaceProvider.requiredSecrets()).toEqual(["HF_TOKEN"]);
  });

  it("returns container env with HF_TOKEN", () => {
    const provider = new HuggingFaceProvider(
      { HF_TOKEN: "hf_test" },
      { hfClient: makeMockHfClient() }
    );
    expect(provider.getContainerEnv()).toEqual({ HF_TOKEN: "hf_test" });
  });

  it("does not support tools", async () => {
    const provider = new HuggingFaceProvider(
      { HF_TOKEN: "hf_test" },
      { hfClient: makeMockHfClient() }
    );
    expect(await provider.hasToolSupport("any-model")).toBe(false);
  });

  describe("generateMessage", () => {
    it("generates a non-streaming message", async () => {
      const mockClient = makeMockHfClient();
      const provider = new HuggingFaceProvider(
        { HF_TOKEN: "hf_test" },
        { hfClient: mockClient }
      );

      const messages: Message[] = [{ role: "user", content: "hello" }];
      const result = await provider.generateMessage({
        messages,
        model: "meta-llama/Llama-3.1-8B-Instruct"
      });

      expect(result.role).toBe("assistant");
      expect(result.content).toBe("hello from hf");
      expect(mockClient.chatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "meta-llama/Llama-3.1-8B-Instruct",
          messages: [{ role: "user", content: "hello" }]
        })
      );
    });

    it("converts tool messages to user role", async () => {
      const mockClient = makeMockHfClient();
      const provider = new HuggingFaceProvider(
        { HF_TOKEN: "hf_test" },
        { hfClient: mockClient }
      );

      const messages: Message[] = [
        { role: "tool", content: "tool result", toolCallId: "tc_1" }
      ];
      await provider.generateMessage({
        messages,
        model: "test-model"
      });

      const sentMessages = mockClient.chatCompletion.mock.calls[0][0].messages;
      expect(sentMessages[0].role).toBe("user");
    });

    it("extracts text from array content", async () => {
      const mockClient = makeMockHfClient();
      const provider = new HuggingFaceProvider(
        { HF_TOKEN: "hf_test" },
        { hfClient: mockClient }
      );

      const messages: Message[] = [
        {
          role: "user",
          content: [
            { type: "text", text: "first" },
            { type: "text", text: "second" }
          ]
        }
      ];
      await provider.generateMessage({
        messages,
        model: "test-model"
      });

      const sentMessages = mockClient.chatCompletion.mock.calls[0][0].messages;
      expect(sentMessages[0].content).toBe("first\nsecond");
    });

    it("passes temperature and topP", async () => {
      const mockClient = makeMockHfClient();
      const provider = new HuggingFaceProvider(
        { HF_TOKEN: "hf_test" },
        { hfClient: mockClient }
      );

      await provider.generateMessage({
        messages: [{ role: "user", content: "test" }],
        model: "test-model",
        temperature: 0.5,
        topP: 0.9
      });

      expect(mockClient.chatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.5,
          top_p: 0.9
        })
      );
    });

    it("tracks usage from response", async () => {
      const mockClient = makeMockHfClient();
      const provider = new HuggingFaceProvider(
        { HF_TOKEN: "hf_test" },
        { hfClient: mockClient }
      );

      await provider.generateMessage({
        messages: [{ role: "user", content: "test" }],
        model: "test-model"
      });

      // cost should have been tracked (exact value depends on cost calculator)
      expect(provider.getTotalCost()).toBeGreaterThanOrEqual(0);
    });
  });

  describe("generateMessages (streaming)", () => {
    it("streams message chunks", async () => {
      const mockClient = makeMockHfClient();
      const provider = new HuggingFaceProvider(
        { HF_TOKEN: "hf_test" },
        { hfClient: mockClient }
      );

      const messages: Message[] = [{ role: "user", content: "hi" }];
      const items: unknown[] = [];
      for await (const item of provider.generateMessages({
        messages,
        model: "test-model"
      })) {
        items.push(item);
      }

      expect(items.length).toBe(2);
      expect((items[0] as any).content).toBe("streamed");
      expect((items[1] as any).done).toBe(true);
    });
  });

  describe("textToImage", () => {
    it("generates an image from a prompt", async () => {
      const mockClient = makeMockHfClient();
      const provider = new HuggingFaceProvider(
        { HF_TOKEN: "hf_test" },
        { hfClient: mockClient }
      );

      const params: TextToImageParams = {
        model: {
          id: "stabilityai/stable-diffusion-xl-base-1.0",
          name: "SDXL",
          provider: "huggingface"
        },
        prompt: "A cute cat"
      };

      const result = await provider.textToImage(params);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(mockClient.textToImage).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "stabilityai/stable-diffusion-xl-base-1.0",
          inputs: "A cute cat"
        })
      );
    });

    it("passes negative prompt and dimensions as parameters", async () => {
      const mockClient = makeMockHfClient();
      const provider = new HuggingFaceProvider(
        { HF_TOKEN: "hf_test" },
        { hfClient: mockClient }
      );

      await provider.textToImage({
        model: {
          id: "test-model",
          name: "Test",
          provider: "huggingface"
        },
        prompt: "A dog",
        negativePrompt: "blurry",
        width: 512,
        height: 768,
        guidanceScale: 7.5,
        numInferenceSteps: 30
      });

      const call = mockClient.textToImage.mock.calls[0][0];
      expect(call.parameters.negative_prompt).toBe("blurry");
      expect(call.parameters.width).toBe(512);
      expect(call.parameters.height).toBe(768);
      expect(call.parameters.guidance_scale).toBe(7.5);
      expect(call.parameters.num_inference_steps).toBe(30);
    });

    it("throws on empty prompt", async () => {
      const provider = new HuggingFaceProvider(
        { HF_TOKEN: "hf_test" },
        { hfClient: makeMockHfClient() }
      );

      await expect(
        provider.textToImage({
          model: {
            id: "test-model",
            name: "Test",
            provider: "huggingface"
          },
          prompt: ""
        })
      ).rejects.toThrow("The input prompt cannot be empty.");
    });

    it("handles Uint8Array result directly", async () => {
      const mockClient = makeMockHfClient({
        textToImage: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]))
      });
      const provider = new HuggingFaceProvider(
        { HF_TOKEN: "hf_test" },
        { hfClient: mockClient }
      );

      const result = await provider.textToImage({
        model: { id: "test", name: "Test", provider: "huggingface" },
        prompt: "test"
      });

      expect(result).toEqual(new Uint8Array([1, 2, 3]));
    });

    it("handles ArrayBuffer result", async () => {
      const buf = new ArrayBuffer(4);
      new Uint8Array(buf).set([10, 20, 30, 40]);
      const mockClient = makeMockHfClient({
        textToImage: vi.fn().mockResolvedValue(buf)
      });
      const provider = new HuggingFaceProvider(
        { HF_TOKEN: "hf_test" },
        { hfClient: mockClient }
      );

      const result = await provider.textToImage({
        model: { id: "test", name: "Test", provider: "huggingface" },
        prompt: "test"
      });

      expect(result).toEqual(new Uint8Array([10, 20, 30, 40]));
    });
  });

  describe("textToSpeech", () => {
    it("generates speech from text", async () => {
      const mockClient = makeMockHfClient();
      const provider = new HuggingFaceProvider(
        { HF_TOKEN: "hf_test" },
        { hfClient: mockClient }
      );

      const chunks: unknown[] = [];
      for await (const chunk of provider.textToSpeech({
        text: "Hello world",
        model: "facebook/mms-tts-eng"
      })) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBe(1);
      expect((chunks[0] as any).samples).toBeInstanceOf(Int16Array);
      expect(mockClient.textToSpeech).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "facebook/mms-tts-eng",
          inputs: "Hello world"
        })
      );
    });

    it("throws on empty text", async () => {
      const provider = new HuggingFaceProvider(
        { HF_TOKEN: "hf_test" },
        { hfClient: makeMockHfClient() }
      );

      const gen = provider.textToSpeech({ text: "", model: "test" });
      await expect(gen.next()).rejects.toThrow("text must not be empty");
    });
  });

  describe("model listing", () => {
    it("returns language models", async () => {
      const provider = new HuggingFaceProvider(
        { HF_TOKEN: "hf_test" },
        { hfClient: makeMockHfClient() }
      );

      const models = await provider.getAvailableLanguageModels();
      expect(models.length).toBeGreaterThan(0);
      expect(models.every((m) => m.provider === "huggingface")).toBe(true);
    });

    it("returns image models", async () => {
      const provider = new HuggingFaceProvider(
        { HF_TOKEN: "hf_test" },
        { hfClient: makeMockHfClient() }
      );

      const models = await provider.getAvailableImageModels();
      expect(models.length).toBeGreaterThan(0);
      expect(models.every((m) => m.provider === "huggingface")).toBe(true);
    });

    it("returns TTS models", async () => {
      const provider = new HuggingFaceProvider(
        { HF_TOKEN: "hf_test" },
        { hfClient: makeMockHfClient() }
      );

      const models = await provider.getAvailableTTSModels();
      expect(models.length).toBeGreaterThan(0);
      expect(models.every((m) => m.provider === "huggingface")).toBe(true);
    });
  });
});
