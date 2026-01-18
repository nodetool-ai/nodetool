import {
  isHuggingFaceProvider,
  isHuggingFaceLocalProvider,
  isLocalProvider,
  isCloudProvider,
  isHuggingFaceInferenceProvider,
  toTitleCase,
  getProviderBaseName,
  formatGenericProviderName,
  getProviderUrl,
  getModelUrl
} from "../providerDisplay";

describe("providerDisplay", () => {
  describe("isHuggingFaceProvider", () => {
    it("should return true for various HuggingFace formats", () => {
      expect(isHuggingFaceProvider("huggingface")).toBe(true);
      expect(isHuggingFaceProvider("huggingface/")).toBe(true);
      expect(isHuggingFaceProvider("huggingface/fireworks-ai")).toBe(true);
      expect(isHuggingFaceProvider("huggingface_cerebras")).toBe(true);
      expect(isHuggingFaceProvider("huggingface-nvidia")).toBe(true);
      expect(isHuggingFaceProvider("huggingface openai")).toBe(true);
      expect(isHuggingFaceProvider("HuggingFace")).toBe(true);
      expect(isHuggingFaceProvider("HUGGINGFACE")).toBe(true);
      expect(isHuggingFaceProvider("HuggingFaceOpenAI")).toBe(true);
      expect(isHuggingFaceProvider("HuggingFaceBlackForestLabs")).toBe(true);
    });

    it("should return false for non-HuggingFace providers", () => {
      expect(isHuggingFaceProvider("openai")).toBe(false);
      expect(isHuggingFaceProvider("anthropic")).toBe(false);
      expect(isHuggingFaceProvider("google")).toBe(false);
      expect(isHuggingFaceProvider("ollama")).toBe(false);
      expect(isHuggingFaceProvider("hugging")).toBe(false);
      expect(isHuggingFaceProvider("face")).toBe(false);
      expect(isHuggingFaceProvider("")).toBe(false);
      expect(isHuggingFaceProvider(undefined)).toBe(false);
      expect(isHuggingFaceProvider(null as any)).toBe(false);
    });
  });

  describe("toTitleCase", () => {
    it("should convert strings to title case", () => {
      expect(toTitleCase("hello world")).toBe("Hello World");
      expect(toTitleCase("HELLO WORLD")).toBe("Hello World");
      expect(toTitleCase("hElLo WoRlD")).toBe("Hello World");
      expect(toTitleCase("hello")).toBe("Hello");
      expect(toTitleCase("")).toBe("");
    });

    it("should handle multiple spaces", () => {
      expect(toTitleCase("hello   world")).toBe("Hello World");
      expect(toTitleCase("  hello  world  ")).toBe("Hello World");
    });

    it("should handle single word", () => {
      expect(toTitleCase("openai")).toBe("Openai");
      expect(toTitleCase("ANTHROPIC")).toBe("Anthropic");
    });
  });

  describe("getProviderBaseName", () => {
    it("should extract base name from HuggingFace providers", () => {
      expect(getProviderBaseName("huggingface/fireworks-ai")).toBe("Fireworks Ai");
      expect(getProviderBaseName("huggingface_cerebras")).toBe("Cerebras");
      expect(getProviderBaseName("huggingface-nvidia")).toBe("Nvidia");
      expect(getProviderBaseName("huggingface openai")).toBe("Openai");
      expect(getProviderBaseName("HuggingFaceOpenAI")).toBe("Open Ai");
      expect(getProviderBaseName("HuggingFaceBlackForestLabs")).toBe("Black Forest Labs");
    });

    it("should handle plain huggingface", () => {
      expect(getProviderBaseName("huggingface")).toBe("Hugging Face");
      expect(getProviderBaseName("HuggingFace")).toBe("Hugging Face");
      expect(getProviderBaseName("huggingface/")).toBe("Hugging Face");
    });

    it("should handle nested paths", () => {
      expect(getProviderBaseName("huggingface/org/model")).toBe("Model");
      expect(getProviderBaseName("provider/sub/path")).toBe("Path");
    });

    it("should normalize separators", () => {
      expect(getProviderBaseName("test-provider_name")).toBe("Test Provider Name");
      expect(getProviderBaseName("test--provider__name")).toBe("Test Provider Name");
    });

    it("should add spaces before capitals", () => {
      expect(getProviderBaseName("TestProvider")).toBe("Test Provider");
      expect(getProviderBaseName("testProviderName")).toBe("Test Provider Name");
      expect(getProviderBaseName("XMLParser")).toBe("Xmlparser");
    });

    it("should handle empty or undefined input", () => {
      expect(getProviderBaseName("")).toBe("");
      expect(getProviderBaseName(undefined)).toBe("");
      expect(getProviderBaseName(null as any)).toBe("");
    });

    it("should handle whitespace", () => {
      expect(getProviderBaseName("  test  provider  ")).toBe("Test Provider");
      expect(getProviderBaseName("huggingface/  test  ")).toBe("Test");
    });
  });

  describe("formatGenericProviderName", () => {
    it("should format generic provider names", () => {
      expect(formatGenericProviderName("openai")).toBe("Openai");
      expect(formatGenericProviderName("anthropic")).toBe("Anthropic");
      expect(formatGenericProviderName("test_provider")).toBe("Test Provider");
      expect(formatGenericProviderName("test-provider")).toBe("Test Provider");
    });

    it("should handle special case for Google", () => {
      expect(formatGenericProviderName("google")).toBe("Gemini");
      expect(formatGenericProviderName("Google")).toBe("Gemini");
      expect(formatGenericProviderName("GOOGLE")).toBe("Gemini");
    });

    it("should add spaces before capitals", () => {
      expect(formatGenericProviderName("OpenAI")).toBe("Open Ai");
      expect(formatGenericProviderName("BlackForestLabs")).toBe("Black Forest Labs");
      expect(formatGenericProviderName("testProviderName")).toBe("Test Provider Name");
    });

    it("should handle empty or undefined input", () => {
      expect(formatGenericProviderName("")).toBe("");
      expect(formatGenericProviderName(undefined)).toBe("");
      expect(formatGenericProviderName(null as any)).toBe("");
    });

    it("should normalize multiple separators", () => {
      expect(formatGenericProviderName("test___provider---name")).toBe("Test Provider Name");
    });
  });

  describe("getProviderUrl", () => {
    it("should return HuggingFace URLs for HF providers", () => {
      expect(getProviderUrl("huggingface")).toBe("https://huggingface.co");
      expect(getProviderUrl("huggingface/fireworks-ai")).toBe("https://huggingface.co/fireworks-ai");
      expect(getProviderUrl("huggingface_cerebras")).toBe("https://huggingface.co/cerebras");
      expect(getProviderUrl("HuggingFaceBlackForestLabs")).toBe("https://huggingface.co/blackforestlabs");
    });

    it("should handle HuggingFace org aliases", () => {
      expect(getProviderUrl("huggingface/together")).toBe("https://huggingface.co/togethercomputer");
      expect(getProviderUrl("huggingface_sambanova")).toBe("https://huggingface.co/sambanovasystems");
    });

    it("should return URLs for known providers", () => {
      expect(getProviderUrl("ollama")).toBe("https://ollama.com");
      expect(getProviderUrl("Ollama")).toBe("https://ollama.com");
      expect(getProviderUrl("lmstudio")).toBe("https://lmstudio.ai");
      expect(getProviderUrl("LMStudio")).toBe("https://lmstudio.ai");
      expect(getProviderUrl("openai")).toBe("https://platform.openai.com");
      expect(getProviderUrl("OpenAI")).toBe("https://platform.openai.com");
      expect(getProviderUrl("anthropic")).toBe("https://console.anthropic.com");
      expect(getProviderUrl("Anthropic")).toBe("https://console.anthropic.com");
      expect(getProviderUrl("gemini")).toBe("https://ai.google.dev");
      expect(getProviderUrl("google")).toBe("https://ai.google.dev");
      expect(getProviderUrl("replicate")).toBe("https://replicate.com");
      expect(getProviderUrl("Replicate")).toBe("https://replicate.com");
      expect(getProviderUrl("aime")).toBe("https://www.aime.info/en/");
      expect(getProviderUrl("AIME")).toBe("https://www.aime.info/en/");
    });

    it("should return null for unknown providers", () => {
      expect(getProviderUrl("unknown")).toBeNull();
      expect(getProviderUrl("test-provider")).toBeNull();
      expect(getProviderUrl("random")).toBeNull();
    });

    it("should handle empty or undefined input", () => {
      expect(getProviderUrl("")).toBeNull();
      expect(getProviderUrl(undefined)).toBeNull();
      expect(getProviderUrl(null as any)).toBeNull();
    });

    it("should handle partial matches", () => {
      expect(getProviderUrl("my-ollama-instance")).toBe("https://ollama.com");
      expect(getProviderUrl("openai-custom")).toBe("https://platform.openai.com");
      expect(getProviderUrl("anthropic-claude")).toBe("https://console.anthropic.com");
    });

    it("should handle complex HuggingFace paths", () => {
      expect(getProviderUrl("huggingface/org/sub/path")).toBe("https://huggingface.co/path");
      expect(getProviderUrl("HuggingFace/")).toBe("https://huggingface.co");
    });

    it("should normalize HuggingFace slugs", () => {
      expect(getProviderUrl("huggingface/Test Provider")).toBe("https://huggingface.co/test-provider");
      expect(getProviderUrl("huggingface_test_provider")).toBe("https://huggingface.co/test-provider");
      expect(getProviderUrl("HuggingFaceTestProvider")).toBe("https://huggingface.co/testprovider");
    });
  });

  describe("isHuggingFaceLocalProvider", () => {
    it("should return true for plain huggingface provider", () => {
      expect(isHuggingFaceLocalProvider("huggingface")).toBe(true);
      expect(isHuggingFaceLocalProvider("HuggingFace")).toBe(true);
      expect(isHuggingFaceLocalProvider("HUGGINGFACE")).toBe(true);
    });

    it("should return false for org providers", () => {
      expect(isHuggingFaceLocalProvider("huggingface/openai")).toBe(false);
      expect(isHuggingFaceLocalProvider("huggingface_fireworks")).toBe(false);
      expect(isHuggingFaceLocalProvider("HuggingFaceNVIDIA")).toBe(false);
    });

    it("should return false for empty or undefined input", () => {
      expect(isHuggingFaceLocalProvider("")).toBe(false);
      expect(isHuggingFaceLocalProvider(undefined)).toBe(false);
      expect(isHuggingFaceLocalProvider(null as any)).toBe(false);
    });
  });

  describe("isLocalProvider", () => {
    it("should return true for huggingface", () => {
      expect(isLocalProvider("huggingface")).toBe(true);
      expect(isLocalProvider("HUGGINGFACE")).toBe(true);
    });

    it("should return true for Ollama variants", () => {
      expect(isLocalProvider("ollama")).toBe(true);
      expect(isLocalProvider("Ollama")).toBe(true);
      expect(isLocalProvider("my-ollama")).toBe(true);
    });

    it("should return true for llama_cpp variants", () => {
      expect(isLocalProvider("llama_cpp")).toBe(true);
      expect(isLocalProvider("llama-cpp")).toBe(true);
      expect(isLocalProvider("llamacpp")).toBe(true);
      expect(isLocalProvider("LlamaCpp")).toBe(true);
    });

    it("should return true for MLX", () => {
      expect(isLocalProvider("mlx")).toBe(true);
      expect(isLocalProvider("MLX")).toBe(true);
    });

    it("should return false for cloud providers", () => {
      expect(isLocalProvider("openai")).toBe(false);
      expect(isLocalProvider("anthropic")).toBe(false);
      expect(isLocalProvider("google")).toBe(false);
    });

    it("should return false for empty or undefined input", () => {
      expect(isLocalProvider("")).toBe(false);
      expect(isLocalProvider(undefined)).toBe(false);
      expect(isLocalProvider(null as any)).toBe(false);
    });
  });

  describe("isCloudProvider", () => {
    it("should return true for cloud providers", () => {
      expect(isCloudProvider("openai")).toBe(true);
      expect(isCloudProvider("anthropic")).toBe(true);
      expect(isCloudProvider("google")).toBe(true);
      expect(isCloudProvider(" Together")).toBe(true);
    });

    it("should return false for local providers", () => {
      expect(isCloudProvider("huggingface")).toBe(false);
      expect(isCloudProvider("ollama")).toBe(false);
      expect(isCloudProvider("llama_cpp")).toBe(false);
      expect(isCloudProvider("mlx")).toBe(false);
    });

    it("should return false for empty or undefined input", () => {
      expect(isCloudProvider("")).toBe(false);
      expect(isCloudProvider(undefined)).toBe(false);
      expect(isCloudProvider(null as any)).toBe(false);
    });
  });

  describe("isHuggingFaceInferenceProvider", () => {
    it("should return true for hf_inference variants", () => {
      expect(isHuggingFaceInferenceProvider("hf_inference")).toBe(true);
      expect(isHuggingFaceInferenceProvider("HF_INFERENCE")).toBe(true);
      expect(isHuggingFaceInferenceProvider("hf-inference")).toBe(true);
    });

    it("should return true for huggingface_inference variants", () => {
      expect(isHuggingFaceInferenceProvider("huggingface_inference")).toBe(true);
      expect(isHuggingFaceInferenceProvider("HuggingFace_Inference")).toBe(true);
    });

    it("should return false for regular providers", () => {
      expect(isHuggingFaceInferenceProvider("huggingface")).toBe(false);
      expect(isHuggingFaceInferenceProvider("openai")).toBe(false);
    });

    it("should return false for empty or undefined input", () => {
      expect(isHuggingFaceInferenceProvider("")).toBe(false);
      expect(isHuggingFaceInferenceProvider(undefined)).toBe(false);
      expect(isHuggingFaceInferenceProvider(null as any)).toBe(false);
    });
  });

  describe("getModelUrl", () => {
    it("should return HuggingFace URLs for HF models", () => {
      expect(getModelUrl("huggingface", "user/model")).toBe("https://huggingface.co/user/model");
      expect(getModelUrl("hf_inference", "model-id")).toBe("https://huggingface.co/model-id");
    });

    it("should return Ollama URLs for ollama models", () => {
      expect(getModelUrl("ollama", "gemma:2b")).toBe("https://ollama.com/library/gemma");
      expect(getModelUrl("ollama", "llama3:latest")).toBe("https://ollama.com/library/llama3");
    });

    it("should return OpenAI docs URL for openai", () => {
      expect(getModelUrl("openai", "gpt-4")).toBe("https://platform.openai.com/docs/models");
      expect(getModelUrl("OpenAI", "gpt-3.5-turbo")).toBe("https://platform.openai.com/docs/models");
    });

    it("should return Anthropic docs URL for anthropic", () => {
      expect(getModelUrl("anthropic", "claude-3-opus-20240229")).toBe("https://docs.anthropic.com/claude/docs/models-overview");
    });

    it("should return Gemini docs URL for google", () => {
      expect(getModelUrl("google", "gemini-pro")).toBe("https://ai.google.dev/models");
      expect(getModelUrl("gemini", "gemini-1.5-flash")).toBe("https://ai.google.dev/models");
    });

    it("should return Mistral docs URL for mistral", () => {
      expect(getModelUrl("mistral", "mistral-large")).toBe("https://docs.mistral.ai/getting-started/models/");
    });

    it("should infer provider from model type", () => {
      expect(getModelUrl(undefined, "gemma:2b", "llama_model")).toBe("https://ollama.com/library/gemma");
    });

    it("should infer HF from model ID format", () => {
      expect(getModelUrl(undefined, "user/repo")).toBe("https://huggingface.co/user/repo");
      expect(getModelUrl(undefined, "model-id")).toBe("https://huggingface.co/model-id");
    });

    it("should infer Ollama from colon in model ID", () => {
      expect(getModelUrl(undefined, "llama2:70b")).toBe("https://ollama.com/library/llama2");
    });

    it("should return null for missing model ID", () => {
      expect(getModelUrl("openai", undefined)).toBeNull();
      expect(getModelUrl("openai", "")).toBeNull();
    });
  });
});