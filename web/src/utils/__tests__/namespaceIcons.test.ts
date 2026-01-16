import { describe, it, expect } from "@jest/globals";
import {
  getNamespaceIcon,
  getNamespaceDisplayName,
  namespaceIcons
} from "../namespaceIcons";
import {
  Input as InputIcon,
  Output as OutputIcon,
  AccountTree as ControlFlowIcon,
  Memory as AiIcon,
  Category as DefaultIcon
} from "@mui/icons-material";

describe("namespaceIcons", () => {
  describe("getNamespaceIcon", () => {
    describe("nodetool namespaces", () => {
      it("should return Input icon for nodetool.input namespace", () => {
        const result = getNamespaceIcon("nodetool.input");
        expect(result.icon).toBe(InputIcon);
        expect(result.label).toBe("Input");
      });

      it("should return Output icon for nodetool.output namespace", () => {
        const result = getNamespaceIcon("nodetool.output");
        expect(result.icon).toBe(OutputIcon);
        expect(result.label).toBe("Output");
      });

      it("should return ControlFlow icon for nodetool.control namespace", () => {
        const result = getNamespaceIcon("nodetool.control");
        expect(result.icon).toBe(ControlFlowIcon);
        expect(result.label).toBe("Control Flow");
      });

      it("should return ControlFlow icon for nodetool.logic namespace", () => {
        const result = getNamespaceIcon("nodetool.logic");
        expect(result.icon).toBe(ControlFlowIcon);
        expect(result.label).toBe("Logic");
      });
    });

    describe("AI provider namespaces", () => {
      it("should return Ai icon for anthropic namespace", () => {
        const result = getNamespaceIcon("anthropic");
        expect(result.icon).toBe(AiIcon);
        expect(result.label).toBe("Anthropic");
      });

      it("should return Ai icon for openai namespace", () => {
        const result = getNamespaceIcon("openai");
        expect(result.icon).toBe(AiIcon);
        expect(result.label).toBe("OpenAI");
      });

      it("should return Ai icon for google namespace", () => {
        const result = getNamespaceIcon("google");
        expect(result.icon).toBe(AiIcon);
        expect(result.label).toBe("Google");
      });

      it("should return Ai icon for bedrock namespace", () => {
        const result = getNamespaceIcon("bedrock");
        expect(result.icon).toBe(AiIcon);
        expect(result.label).toBe("Bedrock");
      });

      it("should return Ai icon for groq namespace", () => {
        const result = getNamespaceIcon("groq");
        expect(result.icon).toBe(AiIcon);
        expect(result.label).toBe("Groq");
      });

      it("should return Ai icon for mistral namespace", () => {
        const result = getNamespaceIcon("mistral");
        expect(result.icon).toBe(AiIcon);
        expect(result.label).toBe("Mistral");
      });

      it("should return Ai icon for huggingface namespace", () => {
        const result = getNamespaceIcon("huggingface");
        expect(result.icon).toBe(AiIcon);
        expect(result.label).toBe("HuggingFace");
      });

      it("should return Ai icon for ollama namespace", () => {
        const result = getNamespaceIcon("ollama");
        expect(result.icon).toBe(AiIcon);
        expect(result.label).toBe("Ollama");
      });

      it("should return Ai icon for replicate namespace", () => {
        const result = getNamespaceIcon("replicate");
        expect(result.icon).toBe(AiIcon);
        expect(result.label).toBe("Replicate");
      });
    });

    describe("nested namespaces", () => {
      it("should match full prefix for nested nodetool.input.string", () => {
        const result = getNamespaceIcon("nodetool.input.string");
        expect(result.icon).toBe(InputIcon);
        expect(result.label).toBe("Input");
      });

      it("should match full prefix for nested anthropic.messages", () => {
        const result = getNamespaceIcon("anthropic.messages");
        expect(result.icon).toBe(AiIcon);
        expect(result.label).toBe("Anthropic");
      });
    });

    describe("unknown namespaces", () => {
      it("should return default icon for completely unknown namespaces", () => {
        const result = getNamespaceIcon("unknown_provider");
        expect(result.icon).toBe(DefaultIcon);
        expect(result.label).toBe("unknown_provider");
      });

      it("should return default icon for deeply nested unknown namespaces", () => {
        const result = getNamespaceIcon("unknown.deep.nested.path");
        expect(result.icon).toBe(DefaultIcon);
        expect(result.label).toBe("path");
      });

      it("should handle empty string", () => {
        const result = getNamespaceIcon("");
        expect(result.icon).toBe(DefaultIcon);
        expect(result.label).toBe("");
      });
    });
  });

  describe("getNamespaceDisplayName", () => {
    it("should return the label for known namespaces", () => {
      expect(getNamespaceDisplayName("nodetool.input")).toBe("Input");
      expect(getNamespaceDisplayName("openai")).toBe("OpenAI");
      expect(getNamespaceDisplayName("anthropic")).toBe("Anthropic");
    });

    it("should return the last part of unknown namespaces", () => {
      expect(getNamespaceDisplayName("unknown.path")).toBe("path");
      expect(getNamespaceDisplayName("custom.namespace.test")).toBe("test");
    });

    it("should handle empty string", () => {
      expect(getNamespaceDisplayName("")).toBe("");
    });
  });

  describe("namespaceIcons configuration", () => {
    it("should have all expected provider keys", () => {
      const expectedProviders = [
        "nodetool.input",
        "nodetool.output",
        "nodetool.control",
        "nodetool.logic",
        "anthropic",
        "openai",
        "google",
        "bedrock",
        "groq",
        "mistral",
        "huggingface",
        "ollama",
        "replicate"
      ];

      expectedProviders.forEach((provider) => {
        expect(namespaceIcons).toHaveProperty([provider]);
      });
    });

    it("should have icon and label for each configuration", () => {
      Object.entries(namespaceIcons).forEach(([_, config]) => {
        expect(config).toHaveProperty("icon");
        expect(config).toHaveProperty("label");
        expect(typeof config.label).toBe("string");
      });
    });
  });
});
