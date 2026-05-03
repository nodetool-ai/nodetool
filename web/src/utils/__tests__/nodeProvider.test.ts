/**
 * @jest-environment node
 */
import {
  getRootNamespace,
  getRequiredSecretKeyForNamespace,
  getSecretDisplayName,
  getProviderKindForNamespace
} from "../nodeProvider";

describe("nodeProvider", () => {
  describe("getRootNamespace", () => {
    it("returns the first segment of a dotted namespace", () => {
      expect(getRootNamespace("openai.gpt4")).toBe("openai");
    });

    it("returns the whole string when there is no dot", () => {
      expect(getRootNamespace("anthropic")).toBe("anthropic");
    });

    it("lowercases the result", () => {
      expect(getRootNamespace("OpenAI.chat")).toBe("openai");
    });

    it("handles deeply nested namespaces", () => {
      expect(getRootNamespace("google.ai.text.gen")).toBe("google");
    });
  });

  describe("getRequiredSecretKeyForNamespace", () => {
    it("returns the correct key for known providers", () => {
      expect(getRequiredSecretKeyForNamespace("openai")).toBe("OPENAI_API_KEY");
      expect(getRequiredSecretKeyForNamespace("anthropic")).toBe(
        "ANTHROPIC_API_KEY"
      );
      expect(getRequiredSecretKeyForNamespace("replicate")).toBe(
        "REPLICATE_API_TOKEN"
      );
      expect(getRequiredSecretKeyForNamespace("huggingface")).toBe("HF_TOKEN");
      expect(getRequiredSecretKeyForNamespace("fal")).toBe("FAL_API_KEY");
    });

    it("works with dotted namespaces", () => {
      expect(getRequiredSecretKeyForNamespace("openai.chat.completions")).toBe(
        "OPENAI_API_KEY"
      );
    });

    it("returns null for unknown namespaces", () => {
      expect(getRequiredSecretKeyForNamespace("unknown_provider")).toBeNull();
    });

    it("handles both dash and underscore variants", () => {
      expect(getRequiredSecretKeyForNamespace("shap-e")).toBe("SHAP_E_API_KEY");
      expect(getRequiredSecretKeyForNamespace("shap_e")).toBe("SHAP_E_API_KEY");
      expect(getRequiredSecretKeyForNamespace("point-e")).toBe(
        "POINT_E_API_KEY"
      );
      expect(getRequiredSecretKeyForNamespace("point_e")).toBe(
        "POINT_E_API_KEY"
      );
    });

    it("handles gemini as alias for google", () => {
      expect(getRequiredSecretKeyForNamespace("gemini")).toBe("GEMINI_API_KEY");
      expect(getRequiredSecretKeyForNamespace("google")).toBe("GEMINI_API_KEY");
    });
  });

  describe("getSecretDisplayName", () => {
    it("returns a human-readable name for known keys", () => {
      expect(getSecretDisplayName("OPENAI_API_KEY")).toBe("OpenAI API Key");
      expect(getSecretDisplayName("HF_TOKEN")).toBe("HuggingFace Token");
      expect(getSecretDisplayName("REPLICATE_API_TOKEN")).toBe(
        "Replicate API Token"
      );
    });

    it("returns the key itself for unknown keys", () => {
      expect(getSecretDisplayName("UNKNOWN_KEY")).toBe("UNKNOWN_KEY");
    });
  });

  describe("getProviderKindForNamespace", () => {
    it('returns "api" for API-backed providers', () => {
      expect(getProviderKindForNamespace("openai")).toBe("api");
      expect(getProviderKindForNamespace("anthropic")).toBe("api");
      expect(getProviderKindForNamespace("replicate")).toBe("api");
      expect(getProviderKindForNamespace("fal")).toBe("api");
    });

    it('returns "local" for local-only namespaces', () => {
      expect(getProviderKindForNamespace("some_local_model")).toBe("local");
    });

    it('returns "local" for huggingface despite having a secret key', () => {
      expect(getProviderKindForNamespace("huggingface")).toBe("local");
    });

    it('returns "api" for namespaces without a secret but in apiNamespacesWithoutSecret', () => {
      expect(getProviderKindForNamespace("messaging")).toBe("api");
    });

    it("works with dotted namespaces", () => {
      expect(getProviderKindForNamespace("openai.gpt4.turbo")).toBe("api");
    });
  });
});
