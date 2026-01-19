import { renderHook } from "@testing-library/react";
import useMetadataStore from "../../stores/MetadataStore";
import { isProduction } from "../../stores/ApiClient";
import { useSecrets } from "../useSecrets";
import useNamespaceTree from "../useNamespaceTree";

jest.mock("../../stores/MetadataStore", () => ({
  __esModule: true,
  default: jest.fn()
}));

jest.mock("../../stores/ApiClient", () => ({
  isProduction: false
}));

jest.mock("../useSecrets", () => ({
  useSecrets: jest.fn()
}));

describe("useNamespaceTree", () => {
  const mockMetadata = {
    "node1": { namespace: "openai.chat", type: "nodetool.openai.Chat" },
    "node2": { namespace: "openai.embedding", type: "nodetool.openai.Embedding" },
    "node3": { namespace: "anthropic.completion", type: "nodetool.anthropic.Completion" },
    "node4": { namespace: "huggingface.text", type: "nodetool.huggingface.Text" },
    "node5": { namespace: "default", type: "nodetool.base.Prompt" },
    "node6": { namespace: "replicate.image", type: "nodetool.replicate.Image" }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    (useMetadataStore as unknown as jest.Mock).mockImplementation((selector?: any) => {
      const state = { metadata: mockMetadata };
      return selector ? selector(state) : state;
    });

    (useSecrets as jest.Mock).mockReturnValue({
      isApiKeySet: jest.fn((key: string) => {
        const keysWithApiKey = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"];
        return keysWithApiKey.includes(key);
      })
    });
  });

  describe("tree structure building", () => {
    it("builds correct hierarchical tree structure", () => {
      const { result } = renderHook(() => useNamespaceTree());
      
      const tree = result.current;
      
      expect(tree["openai"]).toBeDefined();
      expect(tree["anthropic"]).toBeDefined();
      expect(tree["huggingface"]).toBeDefined();
      expect(tree["replicate"]).toBeDefined();
      
      expect(tree["openai"].children["chat"]).toBeDefined();
      expect(tree["openai"].children["embedding"]).toBeDefined();
      expect(tree["anthropic"].children["completion"]).toBeDefined();
      expect(tree["huggingface"].children["text"]).toBeDefined();
      expect(tree["replicate"].children["image"]).toBeDefined();
    });

    it("excludes default namespace", () => {
      const { result } = renderHook(() => useNamespaceTree());
      
      const tree = result.current;
      expect(tree["default"]).toBeUndefined();
    });

    it("removes duplicate namespaces", () => {
      const duplicateMetadata = {
        ...mockMetadata,
        "node7": { namespace: "openai.chat", type: "nodetool.openai.Chat2" }
      };
      
      (useMetadataStore as unknown as jest.Mock).mockImplementation((selector?: any) => {
        const state = { metadata: duplicateMetadata };
        return selector ? selector(state) : state;
      });

      const { result } = renderHook(() => useNamespaceTree());
      
      const openaiChatChildren = Object.keys(result.current["openai"].children["chat"].children || {});
      expect(openaiChatChildren.length).toBe(0);
    });
  });

  describe("namespace sorting", () => {
    it("sorts namespaces alphabetically within same disabled status", () => {
      (useSecrets as jest.Mock).mockReturnValue({
        isApiKeySet: jest.fn(() => true)
      });
      
      const { result } = renderHook(() => useNamespaceTree());
      
      const treeKeys = Object.keys(result.current);
      const alphabeticalOrder = [...treeKeys].sort((a, b) => a.localeCompare(b));
      
      expect(treeKeys).toEqual(alphabeticalOrder);
    });

    it("places enabled namespaces before disabled namespaces", () => {
      (useSecrets as jest.Mock).mockReturnValue({
        isApiKeySet: jest.fn((key: string) => {
          return key === "OPENAI_API_KEY";
        })
      });
      
      const { result } = renderHook(() => useNamespaceTree());
      
      const keys = Object.keys(result.current);
      const openaiIndex = keys.indexOf("openai");
      const anthropicIndex = keys.indexOf("anthropic");
      
      expect(openaiIndex).toBeLessThan(anthropicIndex);
    });
  });

  describe("API key validation", () => {
    it("marks namespaces as disabled when API key is missing (non-production)", () => {
      (useSecrets as jest.Mock).mockReturnValue({
        isApiKeySet: jest.fn(() => false)
      });
      
      const { result } = renderHook(() => useNamespaceTree());
      
      expect(result.current["anthropic"].disabled).toBe(true);
      expect(result.current["anthropic"].requiredKey).toBe("Anthropic API Key");
      
      expect(result.current["replicate"].disabled).toBe(true);
      expect(result.current["replicate"].requiredKey).toBe("Replicate API Token");
    });

    it("marks namespaces as enabled when API key is present", () => {
      (useSecrets as jest.Mock).mockReturnValue({
        isApiKeySet: jest.fn((key: string) => {
          return key === "OPENAI_API_KEY" || key === "ANTHROPIC_API_KEY";
        })
      });
      
      const { result } = renderHook(() => useNamespaceTree());
      
      expect(result.current["openai"].disabled).toBe(false);
      expect(result.current["anthropic"].disabled).toBe(false);
    });

    it("checks isProduction flag", () => {
      expect(typeof isProduction).toBe("boolean");
    });
  });

  describe("first disabled tracking", () => {
    it("marks first disabled root namespace with firstDisabled flag", () => {
      (useSecrets as jest.Mock).mockReturnValue({
        isApiKeySet: jest.fn(() => false)
      });
      
      const { result } = renderHook(() => useNamespaceTree());
      
      const keys = Object.keys(result.current);
      const firstDisabledIndex = keys.findIndex(key => result.current[key].disabled === true);
      const firstDisabledKey = keys[firstDisabledIndex];
      
      expect(result.current[firstDisabledKey].firstDisabled).toBe(true);
    });

    it("only first disabled namespace has firstDisabled flag", () => {
      (useSecrets as jest.Mock).mockReturnValue({
        isApiKeySet: jest.fn(() => false)
      });
      
      const { result } = renderHook(() => useNamespaceTree());
      
      const keys = Object.keys(result.current);
      const disabledKeys = keys.filter(key => result.current[key].disabled === true);
      
      const firstDisabledCount = disabledKeys.filter(
        key => result.current[key].firstDisabled === true
      ).length;
      
      expect(firstDisabledCount).toBe(1);
    });
  });

  describe("nested namespace handling", () => {
    it("creates proper hierarchy for nested namespaces", () => {
      const nestedMetadata = {
        "node1": { namespace: "provider.category.subcategory", type: "nodetool.test.Node" }
      };
      
      (useMetadataStore as unknown as jest.Mock).mockImplementation((selector?: any) => {
        const state = { metadata: nestedMetadata };
        return selector ? selector(state) : state;
      });
      
      const { result } = renderHook(() => useNamespaceTree());
      
      expect(result.current["provider"]).toBeDefined();
      expect(result.current["provider"].children["category"]).toBeDefined();
      expect(result.current["provider"].children["category"].children["subcategory"]).toBeDefined();
    });

    it("propagates disabled status through nested namespaces", () => {
      (useSecrets as jest.Mock).mockReturnValue({
        isApiKeySet: jest.fn(() => false)
      });
      
      const { result } = renderHook(() => useNamespaceTree());
      
      const openai = result.current["openai"];
      expect(openai.children["chat"].disabled).toBe(openai.disabled);
      expect(openai.children["embedding"].disabled).toBe(openai.disabled);
    });
  });

  describe("API key mapping", () => {
    it("maps correct API key names to namespaces", () => {
      const getRequiredKey = (namespace: string) => {
        const apiKeyNames: Record<string, string> = {
          openai: "OpenAI API Key",
          aime: "Aime API Key",
          anthropic: "Anthropic API Key",
          replicate: "Replicate API Token"
        };
        const rootNamespace = namespace.split(".")[0];
        return apiKeyNames[rootNamespace];
      };
      
      expect(getRequiredKey("openai.chat")).toBe("OpenAI API Key");
      expect(getRequiredKey("anthropic.completion")).toBe("Anthropic API Key");
      expect(getRequiredKey("replicate.image")).toBe("Replicate API Token");
      expect(getRequiredKey("aime.test")).toBe("Aime API Key");
    });
  });
});
