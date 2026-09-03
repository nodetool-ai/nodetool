import { renderHook } from "@testing-library/react";
import type { LanguageModel } from "../../stores/ApiTypes";
import {
  pickFirstRunModel,
  useFirstRunLanguageModel
} from "../useFirstRunLanguageModel";

const model = (provider: string, id: string, name: string): LanguageModel =>
  ({ type: "language_model", provider, id, name }) as LanguageModel;

const GEMINI_LITE = model("gemini", "gemini-3.1-flash-lite", "Gemini Flash-Lite");
const SONNET = model("anthropic", "claude-sonnet-5", "Claude Sonnet 5");

const mockChatState = {
  selectedModel: model("empty", "gpt-oss:20b", "gpt-oss:20b"),
  setSelectedModel: jest.fn()
};

const mockCatalog: { models: LanguageModel[]; isLoading: boolean } = {
  models: [],
  isLoading: false
};

const mockUnavailable = new Set<string>();

jest.mock("../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: (selector: (state: typeof mockChatState) => unknown) =>
    selector(mockChatState)
}));

jest.mock("../useModelsByProvider", () => ({
  useLanguageModelsByProvider: () => mockCatalog
}));

jest.mock("../useModelAvailability", () => ({
  useModelAvailability: () => (m: LanguageModel) => ({
    available: !mockUnavailable.has(`${m.provider}:${m.id}`),
    providerEnabled: true,
    hasKey: true
  })
}));

jest.mock("../useRecommendedModelKeys", () => ({
  recommendedModelKey: (provider?: string, id?: string) =>
    `${provider ?? ""}:${id ?? ""}`,
  useRecommendedModelKeys: () => ["anthropic:claude-sonnet-5"]
}));

describe("pickFirstRunModel", () => {
  const always = () => true;

  it("takes the first preferred key that is present", () => {
    const picked = pickFirstRunModel(
      [GEMINI_LITE, SONNET],
      ["openai:gpt-5-mini", "anthropic:claude-sonnet-5"],
      always
    );
    expect(picked?.id).toBe("claude-sonnet-5");
  });

  it("skips a preferred model that is not available", () => {
    const picked = pickFirstRunModel(
      [SONNET],
      ["anthropic:claude-sonnet-5"],
      (m) => m.id !== "claude-sonnet-5"
    );
    expect(picked).toBeNull();
  });

  it("returns null when nothing preferred is in the catalog", () => {
    expect(pickFirstRunModel([GEMINI_LITE], ["openai:gpt-5-mini"], always)).toBeNull();
  });
});

describe("useFirstRunLanguageModel", () => {
  beforeEach(() => {
    mockChatState.selectedModel = model("empty", "gpt-oss:20b", "gpt-oss:20b");
    mockChatState.setSelectedModel = jest.fn();
    mockCatalog.models = [GEMINI_LITE, SONNET];
    mockCatalog.isLoading = false;
    mockUnavailable.clear();
  });

  it("replaces the placeholder with a recommended model", () => {
    renderHook(() => useFirstRunLanguageModel());
    expect(mockChatState.setSelectedModel).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "anthropic", id: "claude-sonnet-5" })
    );
  });

  it("does nothing while the model list is loading", () => {
    mockCatalog.isLoading = true;
    renderHook(() => useFirstRunLanguageModel());
    expect(mockChatState.setSelectedModel).not.toHaveBeenCalled();
  });

  it("never overrides a model the user chose", () => {
    mockChatState.selectedModel = GEMINI_LITE;
    renderHook(() => useFirstRunLanguageModel());
    expect(mockChatState.setSelectedModel).not.toHaveBeenCalled();
  });

  it("leaves the placeholder when no recommended model is available", () => {
    mockUnavailable.add("anthropic:claude-sonnet-5");
    renderHook(() => useFirstRunLanguageModel());
    expect(mockChatState.setSelectedModel).not.toHaveBeenCalled();
  });
});
