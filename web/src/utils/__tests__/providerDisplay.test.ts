import {
  isHuggingFaceProvider,
  isHuggingFaceLocalProvider,
  isLocalProvider,
  isCloudProvider,
  isHuggingFaceInferenceProvider,
  toTitleCase,
  getProviderBaseName,
  formatGenericProviderName
} from "../providerDisplay";

describe("providerDisplay", () => {
  describe("isHuggingFaceProvider", () => {
    it("returns true for huggingface provider", () => {
      expect(isHuggingFaceProvider("huggingface")).toBe(true);
    });

    it("returns true for huggingface with slash", () => {
      expect(isHuggingFaceProvider("huggingface/openai")).toBe(true);
    });

    it("returns true for huggingface with underscore", () => {
      expect(isHuggingFaceProvider("huggingface_test")).toBe(true);
    });

    it("returns true for huggingface with dash", () => {
      expect(isHuggingFaceProvider("huggingface-test")).toBe(true);
    });

    it("returns true for HuggingFace with capitalization", () => {
      expect(isHuggingFaceProvider("HuggingFaceOpenAI")).toBe(true);
    });

    it("returns false for undefined", () => {
      expect(isHuggingFaceProvider(undefined)).toBe(false);
    });

    it("returns false for null", () => {
      expect(isHuggingFaceProvider(null as any)).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isHuggingFaceProvider("")).toBe(false);
    });

    it("returns false for non-huggingface providers", () => {
      expect(isHuggingFaceProvider("openai")).toBe(false);
      expect(isHuggingFaceProvider("anthropic")).toBe(false);
      expect(isHuggingFaceProvider("google")).toBe(false);
    });
  });

  describe("isHuggingFaceLocalProvider", () => {
    it("returns true for exact 'huggingface' provider", () => {
      expect(isHuggingFaceLocalProvider("huggingface")).toBe(true);
    });

    it("returns true for 'HuggingFace' with different case", () => {
      expect(isHuggingFaceLocalProvider("HuggingFace")).toBe(true);
    });

    it("returns false for huggingface with sub-org", () => {
      expect(isHuggingFaceLocalProvider("huggingface/openai")).toBe(false);
    });

    it("returns false for HuggingFaceOpenAI", () => {
      expect(isHuggingFaceLocalProvider("HuggingFaceOpenAI")).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isHuggingFaceLocalProvider(undefined)).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isHuggingFaceLocalProvider("")).toBe(false);
    });
  });

  describe("isLocalProvider", () => {
    it("returns true for huggingface", () => {
      expect(isLocalProvider("huggingface")).toBe(true);
    });

    it("returns true for ollama", () => {
      expect(isLocalProvider("ollama")).toBe(true);
    });

    it("returns true for llama_cpp", () => {
      expect(isLocalProvider("llama_cpp")).toBe(true);
    });

    it("returns true for llama-cpp", () => {
      expect(isLocalProvider("llama-cpp")).toBe(true);
    });

    it("returns true for llamacpp", () => {
      expect(isLocalProvider("llamacpp")).toBe(true);
    });

    it("returns true for MLX", () => {
      expect(isLocalProvider("MLX")).toBe(true);
    });

    it("returns false for openai", () => {
      expect(isLocalProvider("openai")).toBe(false);
    });

    it("returns false for anthropic", () => {
      expect(isLocalProvider("anthropic")).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isLocalProvider(undefined)).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isLocalProvider("")).toBe(false);
    });

    it("is case insensitive", () => {
      expect(isLocalProvider("OLLAMA")).toBe(true);
      expect(isLocalProvider("Ollama")).toBe(true);
    });
  });

  describe("isCloudProvider", () => {
    it("returns false for local providers", () => {
      expect(isCloudProvider("huggingface")).toBe(false);
      expect(isCloudProvider("ollama")).toBe(false);
      expect(isCloudProvider("llama_cpp")).toBe(false);
    });

    it("returns true for API providers", () => {
      expect(isCloudProvider("openai")).toBe(true);
      expect(isCloudProvider("anthropic")).toBe(true);
      expect(isCloudProvider("google")).toBe(true);
    });

    it("returns false for undefined", () => {
      expect(isCloudProvider(undefined)).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isCloudProvider("")).toBe(false);
    });
  });

  describe("isHuggingFaceInferenceProvider", () => {
    it("returns true for hf_inference", () => {
      expect(isHuggingFaceInferenceProvider("hf_inference")).toBe(true);
    });

    it("returns true for huggingface_inference", () => {
      expect(isHuggingFaceInferenceProvider("huggingface_inference")).toBe(true);
    });

    it("returns false for openai", () => {
      expect(isHuggingFaceInferenceProvider("openai")).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isHuggingFaceInferenceProvider(undefined)).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isHuggingFaceInferenceProvider("")).toBe(false);
    });
  });

  describe("toTitleCase", () => {
    it("converts lowercase to title case", () => {
      expect(toTitleCase("hello world")).toBe("Hello World");
    });

    it("handles single word", () => {
      expect(toTitleCase("hello")).toBe("Hello");
    });

    it("handles multiple spaces", () => {
      expect(toTitleCase("hello   world")).toBe("Hello World");
    });

    it("preserves existing capital letters", () => {
      expect(toTitleCase("Hello World")).toBe("Hello World");
    });

    it("converts uppercase to title case", () => {
      expect(toTitleCase("HELLO WORLD")).toBe("Hello World");
    });

    it("handles empty string", () => {
      expect(toTitleCase("")).toBe("");
    });

    it("trims leading and trailing spaces", () => {
      expect(toTitleCase("  hello world  ")).toBe("Hello World");
    });
  });

  describe("getProviderBaseName", () => {
    it("returns empty string for empty input", () => {
      expect(getProviderBaseName("")).toBe("");
    });

    it("returns empty string for undefined", () => {
      expect(getProviderBaseName(undefined)).toBe("");
    });

    it("removes leading huggingface prefix with slash", () => {
      expect(getProviderBaseName("huggingface/openai")).toBe("Openai");
    });

    it("removes leading huggingface prefix with underscore", () => {
      expect(getProviderBaseName("huggingface_test")).toBe("Test");
    });

    it("removes leading huggingface prefix with dash", () => {
      expect(getProviderBaseName("huggingface-test")).toBe("Test");
    });

    it("removes HuggingFace PascalCase prefix", () => {
      expect(getProviderBaseName("HuggingFaceOpenAI")).toBe("Open Ai");
    });

    it("handles complex provider names", () => {
      expect(getProviderBaseName("huggingface/BlackForestLabs_Flux_Schnell")).toBe("Black Forest Labs Flux Schnell");
    });

    it("normalizes separators", () => {
      expect(getProviderBaseName("some_provider-name")).toBe("Some Provider Name");
    });

    it("adds spaces before capitals", () => {
      expect(getProviderBaseName("BlackForestLabs")).toBe("Black Forest Labs");
    });
  });

  describe("formatGenericProviderName", () => {
    it("formats llama_cpp correctly", () => {
      expect(formatGenericProviderName("llama_cpp")).toBe("Llama.cpp");
    });

    it("formats llama-cpp correctly", () => {
      expect(formatGenericProviderName("llama-cpp")).toBe("Llama.cpp");
    });

    it("formats llamacpp correctly", () => {
      expect(formatGenericProviderName("llamacpp")).toBe("Llama.cpp");
    });

    it("formats google as Gemini", () => {
      expect(formatGenericProviderName("google")).toBe("Gemini");
    });

    it("formats fal_ai variants correctly", () => {
      expect(formatGenericProviderName("fal_ai")).toBe("FAL AI");
      expect(formatGenericProviderName("fal-ai")).toBe("FAL AI");
      expect(formatGenericProviderName("falai")).toBe("FAL AI");
    });

    it("formats generic provider names", () => {
      expect(formatGenericProviderName("openai")).toBe("Openai");
      expect(formatGenericProviderName("anthropic")).toBe("Anthropic");
    });

    it("handles underscores and dashes", () => {
      expect(formatGenericProviderName("some_provider")).toBe("Some Provider");
      expect(formatGenericProviderName("some-provider")).toBe("Some Provider");
    });

    it("handles empty string", () => {
      expect(formatGenericProviderName("")).toBe("");
    });

    it("handles undefined", () => {
      expect(formatGenericProviderName(undefined)).toBe("");
    });

    it("adds spaces before capitals", () => {
      expect(formatGenericProviderName("BlackForestLabs")).toBe("Black Forest Labs");
    });
  });
});
