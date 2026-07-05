import { describe, it, expect } from "@jest/globals";
import {
  isHuggingFaceProvider,
  isHuggingFaceLocalProvider,
  isHuggingFaceInferenceProvider,
  isLocalProvider,
  isCloudProvider,
  getModelUrl,
  toTitleCase,
  getProviderBaseName,
  formatGenericProviderName,
  getProviderUrl
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
      expect(formatGenericProviderName("openai")).toBe("OpenAI");
      expect(formatGenericProviderName("anthropic")).toBe("Anthropic");
      expect(formatGenericProviderName("test_provider")).toBe("Test Provider");
      expect(formatGenericProviderName("test-provider")).toBe("Test Provider");
      expect(formatGenericProviderName("hunyuan3d-v2")).toBe("Hunyuan3D V2");
      expect(formatGenericProviderName("trellis-2")).toBe("Trellis 2");
      expect(formatGenericProviderName("triposr")).toBe("TripoSR");
      expect(formatGenericProviderName("shap_e")).toBe("Shap-E");
      expect(formatGenericProviderName("point_e")).toBe("Point-E");
      expect(formatGenericProviderName("meshy")).toBe("Meshy AI");
      expect(formatGenericProviderName("rodin")).toBe("Rodin AI");
      expect(formatGenericProviderName("mlx")).toBe("MLX");
    });

    it("should handle special case for Google", () => {
      expect(formatGenericProviderName("google")).toBe("Gemini");
      expect(formatGenericProviderName("Google")).toBe("Gemini");
      expect(formatGenericProviderName("GOOGLE")).toBe("Gemini");
    });

    it("should handle special case for Z.AI", () => {
      expect(formatGenericProviderName("zai-org")).toBe("Z.AI");
      expect(formatGenericProviderName("zai_org")).toBe("Z.AI");
      expect(formatGenericProviderName("zai")).toBe("Z.AI");
    });

    it("should handle special case for Moonshot (Kimi)", () => {
      expect(formatGenericProviderName("moonshot")).toBe("Moonshot AI");
      expect(formatGenericProviderName("Moonshot")).toBe("Moonshot AI");
      expect(formatGenericProviderName("kimi")).toBe("Moonshot AI");
    });

    it("should handle Llama.cpp variants", () => {
      expect(formatGenericProviderName("llama_cpp")).toBe("Llama.cpp");
      expect(formatGenericProviderName("llama-cpp")).toBe("Llama.cpp");
      expect(formatGenericProviderName("llamacpp")).toBe("Llama.cpp");
    });

    it("should handle FAL AI variants", () => {
      expect(formatGenericProviderName("fal_ai")).toBe("FAL AI");
      expect(formatGenericProviderName("fal-ai")).toBe("FAL AI");
      expect(formatGenericProviderName("falai")).toBe("FAL AI");
    });

    it("should handle ElevenLabs variants", () => {
      expect(formatGenericProviderName("elevenlabs")).toBe("ElevenLabs");
      expect(formatGenericProviderName("eleven_labs")).toBe("ElevenLabs");
      expect(formatGenericProviderName("eleven-labs")).toBe("ElevenLabs");
    });

    it("should handle other provider aliases", () => {
      expect(formatGenericProviderName("minimax")).toBe("MiniMax");
      expect(formatGenericProviderName("gmi")).toBe("GMI Cloud");
      expect(formatGenericProviderName("cohere")).toBe("Cohere");
      expect(formatGenericProviderName("voyage")).toBe("Voyage AI");
      expect(formatGenericProviderName("voyage-ai")).toBe("Voyage AI");
      expect(formatGenericProviderName("voyageai")).toBe("Voyage AI");
      expect(formatGenericProviderName("jina")).toBe("Jina AI");
      expect(formatGenericProviderName("jina-ai")).toBe("Jina AI");
      expect(formatGenericProviderName("jinaai")).toBe("Jina AI");
    });

    it("should add spaces before capitals", () => {
      expect(formatGenericProviderName("OpenAI")).toBe("OpenAI");
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
      expect(getProviderUrl("meshy")).toBe("https://www.meshy.ai");
      expect(getProviderUrl("rodin")).toBe("https://rodin.ai");
      expect(getProviderUrl("triposr")).toBe("https://triposr.github.io");
      expect(getProviderUrl("trellis-2")).toBe("https://trellis3d.github.io");
      expect(getProviderUrl("shap_e")).toBe("https://github.com/openai/shap-e");
      expect(getProviderUrl("point_e")).toBe("https://github.com/openai/point-e");
      expect(getProviderUrl("hunyuan3d")).toBe("https://github.com/Tencent/Hunyuan3D");
      expect(getProviderUrl("zai")).toBe("https://z.ai");
      expect(getProviderUrl("zai-org")).toBe("https://z.ai");
      expect(getProviderUrl("Z.AI")).toBe("https://z.ai");
      expect(getProviderUrl("moonshot")).toBe("https://platform.moonshot.ai");
      expect(getProviderUrl("kimi")).toBe("https://platform.moonshot.ai");
    });

    it("should return URLs for additional known providers", () => {
      expect(getProviderUrl("elevenlabs")).toBe("https://elevenlabs.io");
      expect(getProviderUrl("ElevenLabs")).toBe("https://elevenlabs.io");
      expect(getProviderUrl("fal")).toBe("https://fal.ai");
      expect(getProviderUrl("fal_ai")).toBe("https://fal.ai");
      expect(getProviderUrl("llama_cpp")).toBe("https://github.com/ggerganov/llama.cpp");
      expect(getProviderUrl("llama-cpp")).toBe("https://github.com/ggerganov/llama.cpp");
      expect(getProviderUrl("minimax")).toBe("https://platform.minimax.io");
      expect(getProviderUrl("gmi")).toBe("https://www.gmicloud.ai");
      expect(getProviderUrl("cohere")).toBe("https://cohere.com");
      expect(getProviderUrl("voyage")).toBe("https://www.voyageai.com");
      expect(getProviderUrl("voyage-ai")).toBe("https://www.voyageai.com");
      expect(getProviderUrl("jina")).toBe("https://jina.ai");
      expect(getProviderUrl("jina-ai")).toBe("https://jina.ai");
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
    it("returns true for plain 'huggingface'", () => {
      expect(isHuggingFaceLocalProvider("huggingface")).toBe(true);
      expect(isHuggingFaceLocalProvider("HuggingFace")).toBe(true);
      expect(isHuggingFaceLocalProvider(" huggingface ")).toBe(true);
    });

    it("returns false for HuggingFace sub-providers", () => {
      expect(isHuggingFaceLocalProvider("huggingface/fireworks-ai")).toBe(false);
      expect(isHuggingFaceLocalProvider("huggingface_cerebras")).toBe(false);
    });

    it("returns false for undefined/empty", () => {
      expect(isHuggingFaceLocalProvider(undefined)).toBe(false);
      expect(isHuggingFaceLocalProvider("")).toBe(false);
    });
  });

  describe("isHuggingFaceInferenceProvider", () => {
    it("returns true for inference providers", () => {
      expect(isHuggingFaceInferenceProvider("hf_inference")).toBe(true);
      expect(isHuggingFaceInferenceProvider("huggingface_inference")).toBe(true);
    });

    it("returns false for non-inference providers", () => {
      expect(isHuggingFaceInferenceProvider("huggingface")).toBe(false);
      expect(isHuggingFaceInferenceProvider("openai")).toBe(false);
    });

    it("returns false for undefined/empty", () => {
      expect(isHuggingFaceInferenceProvider(undefined)).toBe(false);
      expect(isHuggingFaceInferenceProvider("")).toBe(false);
    });
  });

  describe("isLocalProvider", () => {
    it("returns true for local providers", () => {
      expect(isLocalProvider("huggingface")).toBe(true);
      expect(isLocalProvider("ollama")).toBe(true);
      expect(isLocalProvider("llama_cpp")).toBe(true);
      expect(isLocalProvider("llama-cpp")).toBe(true);
      expect(isLocalProvider("llamacpp")).toBe(true);
      expect(isLocalProvider("mlx")).toBe(true);
    });

    it("is case-insensitive", () => {
      expect(isLocalProvider("Ollama")).toBe(true);
      expect(isLocalProvider("OLLAMA")).toBe(true);
      expect(isLocalProvider("MLX")).toBe(true);
      expect(isLocalProvider("HuggingFace")).toBe(true);
      expect(isLocalProvider("LLAMA_CPP")).toBe(true);
    });

    it("returns false for cloud providers", () => {
      expect(isLocalProvider("openai")).toBe(false);
      expect(isLocalProvider("anthropic")).toBe(false);
      expect(isLocalProvider("google")).toBe(false);
    });

    it("returns false for undefined/empty", () => {
      expect(isLocalProvider(undefined)).toBe(false);
      expect(isLocalProvider("")).toBe(false);
    });
  });

  describe("isCloudProvider", () => {
    it("returns true for cloud providers", () => {
      expect(isCloudProvider("openai")).toBe(true);
      expect(isCloudProvider("anthropic")).toBe(true);
    });

    it("returns false for local providers", () => {
      expect(isCloudProvider("ollama")).toBe(false);
      expect(isCloudProvider("huggingface")).toBe(false);
    });

    it("returns false for undefined/empty", () => {
      expect(isCloudProvider(undefined)).toBe(false);
      expect(isCloudProvider("")).toBe(false);
    });
  });

  describe("getModelUrl", () => {
    it("returns null when modelId is missing", () => {
      expect(getModelUrl("openai", undefined)).toBeNull();
      expect(getModelUrl("openai", "")).toBeNull();
    });

    it("returns HuggingFace URL for HF provider", () => {
      expect(getModelUrl("huggingface", "user/repo")).toBe("https://huggingface.co/user/repo");
    });

    it("returns Ollama library URL for Ollama models", () => {
      expect(getModelUrl("ollama", "gemma:2b")).toBe("https://ollama.com/library/gemma");
    });

    it("returns OpenAI docs URL", () => {
      expect(getModelUrl("openai", "gpt-4")).toBe("https://platform.openai.com/docs/models");
    });

    it("returns Anthropic docs URL", () => {
      expect(getModelUrl("anthropic", "claude-3")).toBe("https://docs.anthropic.com/claude/docs/models-overview");
    });

    it("returns Google docs URL", () => {
      expect(getModelUrl("gemini", "gemini-pro")).toBe("https://ai.google.dev/models");
      expect(getModelUrl("google", "gemini-pro")).toBe("https://ai.google.dev/models");
    });

    it("infers Ollama from model ID with colon", () => {
      expect(getModelUrl("", "llama3:latest")).toBe("https://ollama.com/library/llama3");
    });

    it("infers HuggingFace as default", () => {
      expect(getModelUrl("", "user/model")).toBe("https://huggingface.co/user/model");
    });

    it("uses modelType hint for llama_model", () => {
      expect(getModelUrl("", "some-model", "llama_model")).toBe("https://ollama.com/library/some-model");
    });

    it("returns Mistral docs URL", () => {
      expect(getModelUrl("mistral", "mistral-large")).toBe("https://docs.mistral.ai/getting-started/models/");
    });

    it("returns HuggingFace URL for HF sub-providers", () => {
      expect(getModelUrl("hf_inference", "user/repo")).toBe("https://huggingface.co/user/repo");
      expect(getModelUrl("huggingface_cerebras", "user/repo")).toBe("https://huggingface.co/user/repo");
    });

    it("returns null for unknown provider", () => {
      expect(getModelUrl("unknown", "model")).toBeNull();
    });
  });
});
