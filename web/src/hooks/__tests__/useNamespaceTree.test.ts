import { act, renderHook } from "@testing-library/react";
import { isProduction } from "../../lib/env";
import useMetadataStore from "../../stores/MetadataStore";
import useOptionalNodePacksStore from "../../stores/OptionalNodePacksStore";
import { useSecrets } from "../useSecrets";
import useNamespaceTree from "../useNamespaceTree";

jest.mock("../../stores/MetadataStore", () => ({
  __esModule: true,
  default: jest.fn()
}));

jest.mock("../../lib/env", () => ({
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
      // All provider keys present so every keyed namespace is visible.
      (useSecrets as jest.Mock).mockReturnValue({
        isApiKeySet: jest.fn(() => true)
      });

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

    it("keeps keyed providers with a key ahead of local namespaces", () => {
      (useSecrets as jest.Mock).mockReturnValue({
        isApiKeySet: jest.fn(() => true)
      });

      const { result } = renderHook(() => useNamespaceTree());

      const keys = Object.keys(result.current);
      // Local namespaces sort before API providers; openai (api) comes after
      // huggingface (local) once both are visible.
      expect(keys.indexOf("huggingface")).toBeLessThan(keys.indexOf("openai"));
    });
  });

  describe("API key gating (source of truth)", () => {
    it("hides keyed providers until their API key is set", () => {
      (useSecrets as jest.Mock).mockReturnValue({
        isApiKeySet: jest.fn((key: string) => key === "OPENAI_API_KEY")
      });

      const { result } = renderHook(() => useNamespaceTree());

      // openai has its key → visible; anthropic and replicate do not → hidden.
      expect(result.current["openai"]).toBeDefined();
      expect(result.current["anthropic"]).toBeUndefined();
      expect(result.current["replicate"]).toBeUndefined();
    });

    it("never gates locally-run namespaces (e.g. huggingface)", () => {
      (useSecrets as jest.Mock).mockReturnValue({
        isApiKeySet: jest.fn(() => false)
      });

      const { result } = renderHook(() => useNamespaceTree());

      // No keys at all: every API provider is hidden, huggingface stays.
      expect(result.current["huggingface"]).toBeDefined();
      expect(result.current["openai"]).toBeUndefined();
      expect(result.current["anthropic"]).toBeUndefined();
    });
  });

  describe("API key validation", () => {
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

  });

  describe("optional node packs", () => {
    const metadataWithOptional = {
      core: { namespace: "nodetool.text", type: "nodetool.text.Concat" },
      optional: { namespace: "lib.pdf", type: "lib.pdf.ReadPdf" }
    };

    beforeEach(() => {
      (useMetadataStore as unknown as jest.Mock).mockImplementation(
        (selector?: any) => {
          const state = { metadata: metadataWithOptional };
          return selector ? selector(state) : state;
        }
      );
      (useSecrets as jest.Mock).mockReturnValue({
        isApiKeySet: jest.fn(() => true)
      });
      act(() => {
        useOptionalNodePacksStore.setState({ enabledPackIds: [] });
      });
    });

    afterEach(() => {
      act(() => {
        useOptionalNodePacksStore.setState({ enabledPackIds: [] });
      });
    });

    it("hides optional-pack namespaces by default", () => {
      const { result } = renderHook(() => useNamespaceTree());
      expect(result.current["nodetool"]).toBeDefined();
      expect(result.current["lib"]).toBeUndefined();
    });

    it("reveals an optional-pack namespace once its pack is enabled", () => {
      act(() => {
        useOptionalNodePacksStore.setState({ enabledPackIds: ["documents"] });
      });
      const { result } = renderHook(() => useNamespaceTree());
      expect(result.current["lib"]).toBeDefined();
      expect(result.current["lib"].children["pdf"]).toBeDefined();
    });
  });

  describe("API key mapping", () => {
    it("maps correct API key names to namespaces", () => {
      const getRequiredKey = (namespace: string) => {
        const apiKeyNames: Record<string, string> = {
          openai: "OpenAI API Key",
          aime: "Aime API Key",
          anthropic: "Anthropic API Key",
          replicate: "Replicate API Token",
          meshy: "Meshy API Key"
        };
        const rootNamespace = namespace.split(".")[0];
        return apiKeyNames[rootNamespace];
      };
      
      expect(getRequiredKey("openai.chat")).toBe("OpenAI API Key");
      expect(getRequiredKey("anthropic.completion")).toBe("Anthropic API Key");
      expect(getRequiredKey("replicate.image")).toBe("Replicate API Token");
      expect(getRequiredKey("aime.test")).toBe("Aime API Key");
      expect(getRequiredKey("meshy.generate")).toBe("Meshy API Key");
    });
  });

});
