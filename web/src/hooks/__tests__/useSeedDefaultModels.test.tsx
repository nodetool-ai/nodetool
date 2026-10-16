import { renderHook } from "@testing-library/react";
import type { LanguageModel } from "../../stores/ApiTypes";
import useMediaGenerationStore from "../../stores/MediaGenerationStore";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import { pickSeedModel, useSeedDefaultModels } from "../useSeedDefaultModels";

const lm = (provider: string, id: string): LanguageModel =>
  ({ type: "language_model", provider, id, name: id }) as LanguageModel;

const OLLAMA = lm("ollama", "llama3");
const OPENAI = lm("openai", "gpt-5");
const OPENAI_2 = lm("openai", "gpt-5-mini");

const mockChat = {
  selectedModel: lm("empty", "x"),
  setSelectedModel: jest.fn()
};
const mockLanguage = { models: [] as LanguageModel[], isLoading: false };
const mockImage = {
  models: [] as Array<Record<string, unknown>>,
  isLoading: false
};
const mockTts = {
  models: [] as Array<Record<string, unknown>>,
  isLoading: false
};
const mockUnavailable = new Set<string>();
const nodeUpdate = jest.fn();
let mockNodes: Array<Record<string, unknown>> = [];

jest.mock("../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: (selector: (s: typeof mockChat) => unknown) => selector(mockChat)
}));
jest.mock("../useModelsByProvider", () => ({
  useLanguageModelsByProvider: () => mockLanguage,
  useImageModelsByProvider: () => mockImage,
  useTTSModelsByProvider: () => mockTts
}));
jest.mock("../useModelAvailability", () => ({
  useModelAvailability: () => (m: { provider: string; id: string }) => ({
    available: !mockUnavailable.has(`${m.provider}:${m.id}`)
  })
}));
jest.mock("../useRecommendedModelKeys", () => ({
  recommendedModelKey: (p?: string, id?: string) => `${p ?? ""}:${id ?? ""}`,
  useRecommendedModelKeys: () => []
}));
jest.mock("../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManagerStore: () => ({
    getState: () => ({
      nodeStores: {
        wf: {
          getState: () => ({ nodes: mockNodes, updateNodeProperties: nodeUpdate })
        }
      }
    })
  })
}));
jest.mock("../../stores/MetadataStore", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      getMetadata: () => ({
        properties: [{ name: "model", type: { type: "language_model" } }]
      })
    })
  }
}));

const defaults = () => useModelPreferencesStore.getState().defaults;

beforeEach(() => {
  jest.clearAllMocks();
  useModelPreferencesStore.setState({ defaults: {} });
  mockChat.selectedModel = lm("empty", "x");
  mockLanguage.models = [OLLAMA, OPENAI, OPENAI_2];
  mockLanguage.isLoading = false;
  mockImage.models = [];
  mockImage.isLoading = false;
  mockTts.models = [];
  mockTts.isLoading = false;
  useMediaGenerationStore.setState((state) => ({
    audio: { ...state.audio, model: null, voice: "alloy" }
  }));
  mockUnavailable.clear();
  mockNodes = [];
});

describe("pickSeedModel", () => {
  it("prefers a connected API provider over a local model", () => {
    expect(pickSeedModel([OLLAMA, OPENAI], () => true)?.id).toBe("gpt-5");
  });
  it("falls back to a local model that is usable", () => {
    expect(pickSeedModel([OLLAMA], () => true)?.id).toBe("llama3");
  });
  it("never picks a model that is not usable", () => {
    expect(pickSeedModel([OPENAI], () => false)).toBeNull();
  });
});

describe("useSeedDefaultModels", () => {
  it("pins the first connected API language model, and starts the chat on it", () => {
    renderHook(() => useSeedDefaultModels());
    expect(defaults()["language_model"]).toMatchObject({
      provider: "openai",
      id: "gpt-5"
    });
  });

  it("sets the chat model from the default", () => {
    useModelPreferencesStore.getState().setDefault("language_model", {
      provider: "openai",
      id: "gpt-5",
      name: "gpt-5"
    });
    renderHook(() => useSeedDefaultModels());
    expect(mockChat.setSelectedModel).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "openai", id: "gpt-5" })
    );
  });

  it("never overwrites a default the user set", () => {
    useModelPreferencesStore.getState().setDefault("language_model", {
      provider: "ollama",
      id: "llama3",
      name: "llama3"
    });
    renderHook(() => useSeedDefaultModels());
    expect(defaults()["language_model"]?.id).toBe("llama3");
  });

  it("seeds once: clearing later does not matter until the list changes", () => {
    const { rerender } = renderHook(() => useSeedDefaultModels());
    useModelPreferencesStore.getState().setDefault("language_model", {
      provider: "openai",
      id: "gpt-5-mini",
      name: "gpt-5-mini"
    });
    rerender();
    expect(defaults()["language_model"]?.id).toBe("gpt-5-mini");
  });

  it("waits while the catalog loads and when nothing is usable", () => {
    mockLanguage.isLoading = true;
    const { rerender } = renderHook(() => useSeedDefaultModels());
    expect(defaults()["language_model"]).toBeUndefined();
    mockLanguage.isLoading = false;
    mockUnavailable.add("openai:gpt-5");
    mockUnavailable.add("openai:gpt-5-mini");
    mockUnavailable.add("ollama:llama3");
    rerender();
    expect(defaults()["language_model"]).toBeUndefined();
  });

  it("seeds the image model from the first text-to-image model", () => {
    mockImage.models = [
      { provider: "openai", id: "gpt-image", name: "GPT Image", supported_tasks: ["text_to_image"] }
    ];
    renderHook(() => useSeedDefaultModels());
    expect(defaults()["image_model"]).toMatchObject({ id: "gpt-image" });
  });

  it("fills empty model properties of nodes in open workflows", () => {
    mockNodes = [
      { id: "n1", type: "nodetool.agents.Agent", data: { properties: {} } }
    ];
    renderHook(() => useSeedDefaultModels());
    expect(nodeUpdate).toHaveBeenCalledWith(
      "n1",
      expect.objectContaining({
        model: expect.objectContaining({ provider: "openai", id: "gpt-5" })
      })
    );
  });

  it("seeds the speech model and starts the speech composer on its first voice", () => {
    mockTts.models = [
      { provider: "openai", id: "tts-1", name: "TTS 1", voices: ["verse", "alloy"] }
    ];
    renderHook(() => useSeedDefaultModels());
    expect(defaults()["tts_model"]).toMatchObject({ provider: "openai", id: "tts-1" });
    expect(useMediaGenerationStore.getState().audio).toMatchObject({
      model: { type: "tts_model", provider: "openai", id: "tts-1" },
      voice: "verse"
    });
  });

  it("keeps a speech model the user already picked", () => {
    mockTts.models = [
      { provider: "openai", id: "tts-1", name: "TTS 1", voices: ["verse"] }
    ];
    useMediaGenerationStore.setState((state) => ({
      audio: {
        ...state.audio,
        model: {
          type: "tts_model",
          provider: "elevenlabs",
          id: "v3",
          name: "v3",
          voices: [],
          selected_voice: "rachel"
        },
        voice: "rachel"
      }
    }));
    renderHook(() => useSeedDefaultModels());
    expect(useMediaGenerationStore.getState().audio).toMatchObject({
      model: { id: "v3" },
      voice: "rachel"
    });
  });
});
