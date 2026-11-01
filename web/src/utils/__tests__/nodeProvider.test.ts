/**
 * @jest-environment node
 */
import {
  getRequiredSecretKeyForNamespace,
  getSecretDisplayName,
  getProviderKindForNamespace,
  getNodeProviderId,
  getNodeProviderName,
  getNamespaceDisplayName,
  getProviderIdForGateKey,
  getSettingsKeyForGateKey,
  LOCAL_PROVIDER_ID
} from "../nodeProvider";

describe("nodeProvider", () => {
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

    it("names the Comfy Cloud key without claiming the lib.comfy namespace", () => {
      expect(getSecretDisplayName("COMFY_API_KEY")).toBe("Comfy Cloud");
      // Only RunWorkflowOnCloud needs a key; the local and worker runners must
      // not be badged. The per-node `required_settings` metadata drives that.
      expect(getRequiredSecretKeyForNamespace("lib.comfy")).toBeNull();
    });
  });

  describe("getProviderKindForNamespace", () => {
    it('returns "api" for API-backed providers', () => {
      expect(getProviderKindForNamespace("openai")).toBe("api");
      expect(getProviderKindForNamespace("anthropic")).toBe("api");
      expect(getProviderKindForNamespace("replicate")).toBe("api");
      expect(getProviderKindForNamespace("fal")).toBe("api");
      expect(getProviderKindForNamespace("atlascloud")).toBe("api");
      expect(getProviderKindForNamespace("xai")).toBe("api");
      expect(getProviderKindForNamespace("together")).toBe("api");
      expect(getProviderKindForNamespace("minimax")).toBe("api");
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

  describe("getNodeProviderId", () => {
    it("uses the root namespace of API-backed nodes", () => {
      expect(getNodeProviderId("fal.image_to_video")).toBe("fal");
      expect(getNodeProviderId("kie.image")).toBe("kie");
      expect(getNodeProviderId("messaging.slack")).toBe("messaging");
    });

    it("groups locally run nodes under local", () => {
      expect(getNodeProviderId("nodetool.text")).toBe(LOCAL_PROVIDER_ID);
      expect(getNodeProviderId("lib.image")).toBe(LOCAL_PROVIDER_ID);
      expect(getNodeProviderId("huggingface.text_to_image")).toBe(
        LOCAL_PROVIDER_ID
      );
    });
  });

  describe("getNodeProviderName", () => {
    it("drops the key suffix from the secret's display name", () => {
      expect(getNodeProviderName("fal")).toBe("FAL");
      expect(getNodeProviderName("openai")).toBe("OpenAI");
      expect(getNodeProviderName("xai")).toBe("xAI");
      expect(getNodeProviderName("higgsfield")).toBe("Higgsfield");
      expect(getNodeProviderName("search")).toBe("SerpAPI");
      expect(getNodeProviderName("replicate")).toBe("Replicate");
    });

    it("capitalizes a provider without a key", () => {
      expect(getNodeProviderName("messaging")).toBe("Messaging");
    });
  });

  describe("namespaces that share a vendor", () => {
    it("gate each namespace on its own credential", () => {
      expect(getRequiredSecretKeyForNamespace("gemini.image")).toBe("GEMINI_API_KEY");
      expect(getRequiredSecretKeyForNamespace("vertex.image")).toBe("GOOGLE_CLOUD_PROJECT");
      expect(getRequiredSecretKeyForNamespace("openai.text")).toBe("OPENAI_API_KEY");
      expect(getRequiredSecretKeyForNamespace("codex.text")).toBe("CODEX_ACCESS_TOKEN");
      expect(getRequiredSecretKeyForNamespace("anthropic.text")).toBe("ANTHROPIC_API_KEY");
      expect(getRequiredSecretKeyForNamespace("claude_code.text")).toBe("CLAUDE_SUBSCRIPTION");
    });

    it("treat the sign-in and Google Cloud namespaces as API providers", () => {
      for (const ns of ["vertex.audio", "codex.image", "claude_code.text"]) {
        expect(getProviderKindForNamespace(ns)).toBe("api");
      }
    });

    it("map gates without a stored secret to the provider that satisfies them", () => {
      expect(getProviderIdForGateKey("CODEX_ACCESS_TOKEN")).toBe("codex");
      expect(getProviderIdForGateKey("CLAUDE_SUBSCRIPTION")).toBe("claude_agent_sdk");
      expect(getProviderIdForGateKey("GOOGLE_CLOUD_PROJECT")).toBe("gemini_vertex");
      expect(getProviderIdForGateKey("OPENAI_API_KEY")).toBeNull();
    });

    it("send the ChatGPT sign-in to the OpenAI settings card", () => {
      expect(getSettingsKeyForGateKey("CODEX_ACCESS_TOKEN")).toBe("OPENAI_API_KEY");
      expect(getSettingsKeyForGateKey("CLAUDE_SUBSCRIPTION")).toBe("CLAUDE_SUBSCRIPTION");
    });

    it("name them so the pairs read apart", () => {
      expect(getNodeProviderName("vertex")).toBe("Vertex AI");
      expect(getNodeProviderName("codex")).toBe("Codex");
      expect(getNodeProviderName("claude_code")).toBe("Claude Code");
      expect(getNodeProviderName("anthropic")).toBe("Anthropic");
      expect(getNamespaceDisplayName("vertex")).toBe("Vertex AI");
      expect(getNamespaceDisplayName("gemini")).toBeNull();
    });
  });
});
