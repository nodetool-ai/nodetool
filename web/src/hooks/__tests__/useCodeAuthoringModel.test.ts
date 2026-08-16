import { renderHook } from "@testing-library/react";
import type { LanguageModel } from "../../stores/ApiTypes";
import { useModelPreferencesStore } from "../../stores/ModelPreferencesStore";
import { useCodeAuthoringModel } from "../useCodeAuthoringModel";
import { DEFAULT_MODEL } from "../../config/constants";

const mockChatState: { selectedModel: LanguageModel | null } = {
  selectedModel: null
};
const mockCatalog: { models: LanguageModel[]; isLoading: boolean } = {
  models: [],
  isLoading: false
};

jest.mock("../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: <T,>(selector: (state: unknown) => T) => selector(mockChatState)
}));

jest.mock("../useModelsByProvider", () => ({
  __esModule: true,
  useLanguageModelsByProvider: () => mockCatalog
}));

const model = (
  provider: string,
  id: string,
  supportsTools?: boolean
): LanguageModel => ({
  type: "language_model",
  provider: provider as LanguageModel["provider"],
  id,
  name: id.toUpperCase(),
  ...(supportsTools === undefined ? {} : { supports_tools: supportsTools })
});

const TOOL_MODEL = model("openai", "gpt-tools");
const CHAT_MODEL = model("anthropic", "claude-tools");
const LANGUAGE_MODEL = model("groq", "groq-tools");
const APP_DEFAULT = model("ollama", DEFAULT_MODEL);
const NO_TOOLS = model("replicate", "no-tools", false);

beforeEach(() => {
  useModelPreferencesStore.setState({ defaults: {} });
  mockChatState.selectedModel = null;
  mockCatalog.models = [
    TOOL_MODEL,
    CHAT_MODEL,
    LANGUAGE_MODEL,
    APP_DEFAULT,
    NO_TOOLS
  ];
  mockCatalog.isLoading = false;
});

const setDefaults = (defaults: Record<string, LanguageModel>) => {
  useModelPreferencesStore.setState({
    defaults: Object.fromEntries(
      Object.entries(defaults).map(([key, m]) => [
        key,
        { provider: m.provider as string, id: m.id, name: m.name }
      ])
    )
  });
};

describe("useCodeAuthoringModel", () => {
  it("prefers the code_model preference", () => {
    setDefaults({ code_model: TOOL_MODEL, language_model: LANGUAGE_MODEL });
    mockChatState.selectedModel = CHAT_MODEL;

    const { result } = renderHook(() => useCodeAuthoringModel());

    expect(result.current.model).toEqual({
      provider: "openai",
      id: "gpt-tools",
      name: "GPT-TOOLS"
    });
    expect(result.current.source).toBe("code_preference");
    expect(result.current.skipped).toEqual([]);
    expect(result.current.isBlocked).toBe(false);
  });

  it("falls back to the chat model when no code preference is set", () => {
    setDefaults({ language_model: LANGUAGE_MODEL });
    mockChatState.selectedModel = CHAT_MODEL;

    const { result } = renderHook(() => useCodeAuthoringModel());

    expect(result.current.model?.id).toBe("claude-tools");
    expect(result.current.source).toBe("chat");
  });

  it("falls back to the language_model preference when no chat model is set", () => {
    setDefaults({ language_model: LANGUAGE_MODEL });

    const { result } = renderHook(() => useCodeAuthoringModel());

    expect(result.current.model?.id).toBe("groq-tools");
    expect(result.current.source).toBe("language_model_preference");
  });

  it("falls back to the application default when nothing is configured", () => {
    const { result } = renderHook(() => useCodeAuthoringModel());

    expect(result.current.model?.id).toBe(DEFAULT_MODEL);
    expect(result.current.source).toBe("application_default");
  });

  it("skips a preference whose model has no tool support", () => {
    setDefaults({ code_model: NO_TOOLS });
    mockChatState.selectedModel = CHAT_MODEL;

    const { result } = renderHook(() => useCodeAuthoringModel());

    expect(result.current.source).toBe("chat");
    expect(result.current.skipped).toEqual([
      {
        source: "code_preference",
        model: { provider: "replicate", id: "no-tools", name: "NO-TOOLS" },
        reason: "no_tool_support"
      }
    ]);
  });

  it("skips a candidate the catalog does not list", () => {
    setDefaults({
      code_model: model("openai", "retired-model"),
      language_model: LANGUAGE_MODEL
    });

    const { result } = renderHook(() => useCodeAuthoringModel());

    expect(result.current.source).toBe("language_model_preference");
    expect(result.current.skipped).toHaveLength(1);
    expect(result.current.skipped[0].reason).toBe("unknown_model");
  });

  it("does not match a same-id model from another provider", () => {
    setDefaults({ code_model: model("ollama", "gpt-tools") });

    const { result } = renderHook(() => useCodeAuthoringModel());

    expect(result.current.skipped[0]).toMatchObject({
      source: "code_preference",
      reason: "unknown_model"
    });
    expect(result.current.source).toBe("application_default");
  });

  it("blocks when no candidate supports tools", () => {
    mockCatalog.models = [NO_TOOLS];
    setDefaults({ code_model: NO_TOOLS });
    mockChatState.selectedModel = NO_TOOLS;

    const { result } = renderHook(() => useCodeAuthoringModel());

    expect(result.current.model).toBeNull();
    expect(result.current.source).toBeNull();
    expect(result.current.isBlocked).toBe(true);
    expect(result.current.skipped.map((s) => s.source)).toEqual([
      "code_preference",
      "application_default"
    ]);
  });

  it("blocks when the catalog is empty", () => {
    mockCatalog.models = [];

    const { result } = renderHook(() => useCodeAuthoringModel());

    expect(result.current.isBlocked).toBe(true);
    expect(result.current.model).toBeNull();
  });

  it("reports loading without a model or a block", () => {
    mockCatalog.isLoading = true;
    setDefaults({ code_model: TOOL_MODEL });

    const { result } = renderHook(() => useCodeAuthoringModel());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.model).toBeNull();
    expect(result.current.isBlocked).toBe(false);
  });

  it("treats an unknown supports_tools value as tool-capable", () => {
    mockCatalog.models = [model("openai", "unknown-tools")];
    setDefaults({ code_model: model("openai", "unknown-tools") });

    const { result } = renderHook(() => useCodeAuthoringModel());

    expect(result.current.model?.id).toBe("unknown-tools");
    expect(result.current.isBlocked).toBe(false);
  });

  it("deduplicates a chat model identical to the code preference", () => {
    mockCatalog.models = [NO_TOOLS];
    setDefaults({ code_model: NO_TOOLS });
    mockChatState.selectedModel = NO_TOOLS;

    const { result } = renderHook(() => useCodeAuthoringModel());

    expect(
      result.current.skipped.filter((s) => s.model.id === "no-tools")
    ).toHaveLength(1);
  });
});
