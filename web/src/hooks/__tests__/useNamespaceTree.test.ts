import { renderHook } from "@testing-library/react";
import useNamespaceTree from "../useNamespaceTree";
import useMetadataStore from "../../stores/MetadataStore";
import { useSecrets } from "../useSecrets";

jest.mock("../../stores/MetadataStore");
jest.mock("../useSecrets");
jest.mock("../../stores/ApiClient", () => ({
  isProduction: false
}));

const mockUseMetadataStore = useMetadataStore as jest.MockedFunction<typeof useMetadataStore>;
const mockUseSecrets = useSecrets as jest.MockedFunction<typeof useSecrets>;

describe("useNamespaceTree", () => {
  const mockMetadata = {
    "node1": { namespace: "openai.text", name: "Text Node", description: "", category: "text", inputs: [], outputs: [], parameters: [] },
    "node2": { namespace: "openai.image", name: "Image Node", description: "", category: "image", inputs: [], outputs: [], parameters: [] },
    "node3": { namespace: "anthropic.text", name: "Claude Node", description: "", category: "text", inputs: [], outputs: [], parameters: [] },
    "node4": { namespace: "default", name: "Default Node", description: "", category: "text", inputs: [], outputs: [], parameters: [] },
    "node5": { namespace: "google.gemini", name: "Gemini Node", description: "", category: "text", inputs: [], outputs: [], parameters: [] }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseMetadataStore.mockReturnValue(mockMetadata);
    mockUseSecrets.mockReturnValue({
      secrets: {},
      isApiKeySet: jest.fn().mockReturnValue(false)
    });
  });

  it("returns empty object when metadata is empty", () => {
    mockUseMetadataStore.mockReturnValue({});
    const { result } = renderHook(() => useNamespaceTree());
    expect(result.current).toEqual({});
  });

  it("filters out default namespace", () => {
    const { result } = renderHook(() => useNamespaceTree());
    expect(result.current).not.toHaveProperty("default");
    expect(result.current).toHaveProperty("openai");
    expect(result.current).toHaveProperty("anthropic");
    expect(result.current).toHaveProperty("google");
  });

  it("includes namespaces from metadata", () => {
    const { result } = renderHook(() => useNamespaceTree());
    expect(result.current).toHaveProperty("openai");
    expect(result.current).toHaveProperty("anthropic");
    expect(result.current).toHaveProperty("google");
  });

  it("builds nested namespace structure", () => {
    const { result } = renderHook(() => useNamespaceTree());
    expect(result.current.openai).toHaveProperty("children.text");
    expect(result.current.openai).toHaveProperty("children.image");
    expect(result.current.openai.children.text).toHaveProperty("children");
    expect(result.current.openai.children.image).toHaveProperty("children");
  });

  it("sorts namespaces with enabled first", () => {
    mockUseSecrets.mockReturnValue({
      secrets: {},
      isApiKeySet: jest.fn((key: string) => key === "OPENAI_API_KEY")
    });

    const { result } = renderHook(() => useNamespaceTree());
    const treeKeys = Object.keys(result.current);
    expect(treeKeys.indexOf("openai")).toBeLessThan(treeKeys.indexOf("anthropic"));
  });

  it("marks disabled namespaces when API key is not set", () => {
    mockUseSecrets.mockReturnValue({
      secrets: {},
      isApiKeySet: jest.fn().mockReturnValue(false)
    });

    const { result } = renderHook(() => useNamespaceTree());
    expect(result.current.openai.disabled).toBe(true);
    expect(result.current.anthropic.disabled).toBe(true);
  });

  it("marks enabled namespaces when API key is set", () => {
    mockUseSecrets.mockReturnValue({
      secrets: {},
      isApiKeySet: jest.fn((key: string) => key === "OPENAI_API_KEY")
    });

    const { result } = renderHook(() => useNamespaceTree());
    expect(result.current.openai.disabled).toBe(false);
    expect(result.current.anthropic.disabled).toBe(true);
  });

  it("includes requiredKey for disabled namespaces", () => {
    mockUseSecrets.mockReturnValue({
      secrets: {},
      isApiKeySet: jest.fn().mockReturnValue(false)
    });

    const { result } = renderHook(() => useNamespaceTree());
    expect(result.current.openai.requiredKey).toBe("OpenAI API Key");
    expect(result.current.anthropic.requiredKey).toBe("Anthropic API Key");
  });

  it("does not include requiredKey for enabled namespaces", () => {
    mockUseSecrets.mockReturnValue({
      secrets: {},
      isApiKeySet: jest.fn((key: string) => key === "OPENAI_API_KEY")
    });

    const { result } = renderHook(() => useNamespaceTree());
    expect(result.current.openai.requiredKey).toBeUndefined();
  });

  it("handles deeply nested namespaces", () => {
    mockUseMetadataStore.mockReturnValue({
      "node1": { namespace: "provider.sub.category.feature", name: "Feature", description: "", category: "text", inputs: [], outputs: [], parameters: [] }
    });

    const { result } = renderHook(() => useNamespaceTree());
    expect(result.current.provider).toBeDefined();
    expect(result.current.provider.children).toHaveProperty("sub");
    expect(result.current.provider.children.sub.children).toHaveProperty("category");
    expect(result.current.provider.children.sub.children.category.children).toHaveProperty("feature");
  });

  it("removes duplicate namespaces", () => {
    mockUseMetadataStore.mockReturnValue({
      "node1": { namespace: "openai.text", name: "Text Node", description: "", category: "text", inputs: [], outputs: [], parameters: [] },
      "node2": { namespace: "openai.text", name: "Text Node 2", description: "", category: "text", inputs: [], outputs: [], parameters: [] }
    });

    const { result } = renderHook(() => useNamespaceTree());
    const openaiChildren = Object.keys(result.current.openai.children);
    expect(openaiChildren).toEqual(["text"]);
  });

  it("propagates disabled state to all children", () => {
    mockUseSecrets.mockReturnValue({
      secrets: {},
      isApiKeySet: jest.fn().mockReturnValue(false)
    });

    const { result } = renderHook(() => useNamespaceTree());
    expect(result.current.openai.disabled).toBe(true);
    expect(result.current.openai.children.text.disabled).toBe(true);
  });

  it("returns stable reference on re-render", () => {
    const { result, rerender } = renderHook(() => useNamespaceTree());
    const firstResult = result.current;
    rerender();
    expect(result.current).toBe(firstResult);
  });
});
