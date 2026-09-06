import { renderHook } from "@testing-library/react";
import type { LanguageModel } from "../../../stores/ApiTypes";
import { useModelPreferencesStore } from "../../../stores/ModelPreferencesStore";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useDefaultDirectorModel } from "../useDefaultDirectorModel";

const mockChatState: { selectedModel: LanguageModel | null } = {
  selectedModel: null
};
const mockCatalog: { models: LanguageModel[]; isLoading: boolean } = {
  models: [],
  isLoading: false
};

jest.mock("../../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: <T>(selector: (state: typeof mockChatState) => T) =>
    selector(mockChatState)
}));

jest.mock("../../useModelsByProvider", () => ({
  __esModule: true,
  useLanguageModelsByProvider: () => mockCatalog
}));

const model = (provider: string, id: string): LanguageModel => ({
  type: "language_model",
  provider,
  id,
  name: id.toUpperCase()
});

const CATALOG_FIRST = model("openai", "gpt-catalog");
const CHAT_MODEL = model("anthropic", "claude-chat");
const PREFERRED = model("groq", "groq-preferred");

const BOARD_ID = "board-1";

beforeEach(() => {
  useModelPreferencesStore.setState({ defaults: {} });
  mockChatState.selectedModel = null;
  mockCatalog.models = [CATALOG_FIRST, CHAT_MODEL, PREFERRED];
  mockCatalog.isLoading = false;
  useStoryboardStore.getState().ensureBoard(BOARD_ID);
  useStoryboardStore.getState().setDirectorModel(BOARD_ID, null);
});

const directorModel = () =>
  useStoryboardStore.getState().getBoard(BOARD_ID)?.directorModel ?? null;

it("stamps the first catalog model on a board with none", () => {
  renderHook(() => useDefaultDirectorModel(BOARD_ID));
  expect(directorModel()).toMatchObject({
    id: "gpt-catalog",
    provider: "openai"
  });
});

it("prefers the saved language_model default over the catalog", () => {
  useModelPreferencesStore.setState({
    defaults: { language_model: PREFERRED }
  });
  renderHook(() => useDefaultDirectorModel(BOARD_ID));
  expect(directorModel()?.id).toBe("groq-preferred");
});

it("falls back to the active chat model before the catalog", () => {
  mockChatState.selectedModel = CHAT_MODEL;
  renderHook(() => useDefaultDirectorModel(BOARD_ID));
  expect(directorModel()?.id).toBe("claude-chat");
});

// The chat store starts on a hardcoded default no install has to serve.
it("skips a candidate the catalog does not list", () => {
  mockChatState.selectedModel = model("ollama", "not-installed");
  renderHook(() => useDefaultDirectorModel(BOARD_ID));
  expect(directorModel()?.id).toBe("gpt-catalog");
});

it("leaves a board that already has a model alone", () => {
  useStoryboardStore.getState().setDirectorModel(BOARD_ID, {
    type: "language_model",
    id: "chosen",
    provider: "openai",
    name: "Chosen"
  });
  renderHook(() => useDefaultDirectorModel(BOARD_ID));
  expect(directorModel()?.id).toBe("chosen");
});

it("stamps nothing while the catalog is loading", () => {
  mockCatalog.isLoading = true;
  renderHook(() => useDefaultDirectorModel(BOARD_ID));
  expect(directorModel()).toBeNull();
});

it("stamps nothing when no model is available", () => {
  mockCatalog.models = [];
  renderHook(() => useDefaultDirectorModel(BOARD_ID));
  expect(directorModel()).toBeNull();
});
