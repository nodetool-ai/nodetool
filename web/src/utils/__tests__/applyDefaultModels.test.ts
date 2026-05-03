import { applyDefaultModels } from "../applyDefaultModels";

jest.mock("../../stores/ModelPreferencesStore", () => {
  let state = { defaults: {} as Record<string, { provider: string; id: string; name: string }> };
  const store: any = {
    getState: () => state,
    _setState: (s: typeof state) => { state = s; }
  };
  store.subscribe = jest.fn();
  return { __esModule: true, default: store };
});

import modelPreferencesStore from "../../stores/ModelPreferencesStore";

const setDefaults = (defaults: Record<string, { provider: string; id: string; name: string }>) => {
  (modelPreferencesStore as any)._setState({ defaults });
};

afterEach(() => {
  setDefaults({});
});

describe("applyDefaultModels", () => {
  it("returns properties unchanged when no defaults are set", () => {
    setDefaults({});
    const props = { model: { type: "language_model", provider: "openai", id: "gpt-4", name: "GPT-4" } };
    const meta = [{ name: "model", type: { type: "language_model" } }];

    const result = applyDefaultModels(props, meta);
    expect(result.model).toEqual(props.model);
  });

  it("applies default when property is empty (provider is 'empty')", () => {
    setDefaults({
      language_model: { provider: "anthropic", id: "claude-sonnet", name: "Claude Sonnet" }
    });
    const props = { model: { type: "language_model", provider: "empty", id: "", name: "" } };
    const meta = [{ name: "model", type: { type: "language_model" } }];

    const result = applyDefaultModels(props, meta);
    expect(result.model).toEqual({
      type: "language_model",
      provider: "anthropic",
      id: "claude-sonnet",
      name: "Claude Sonnet"
    });
  });

  it("applies default when property is null", () => {
    setDefaults({
      image_model: { provider: "stability", id: "sdxl", name: "SDXL" }
    });
    const props = { model: null };
    const meta = [{ name: "model", type: { type: "image_model" } }];

    const result = applyDefaultModels(props, meta);
    expect(result.model).toEqual({
      type: "image_model",
      provider: "stability",
      id: "sdxl",
      name: "SDXL"
    });
  });

  it("does not override existing non-empty model", () => {
    setDefaults({
      language_model: { provider: "anthropic", id: "claude-sonnet", name: "Claude Sonnet" }
    });
    const props = { model: { type: "language_model", provider: "openai", id: "gpt-4", name: "GPT-4" } };
    const meta = [{ name: "model", type: { type: "language_model" } }];

    const result = applyDefaultModels(props, meta);
    expect((result.model as any).provider).toBe("openai");
  });

  it("ignores non-model-type properties", () => {
    setDefaults({
      language_model: { provider: "anthropic", id: "claude", name: "Claude" }
    });
    const props = { text: "hello" };
    const meta = [{ name: "text", type: { type: "string" } }];

    const result = applyDefaultModels(props, meta);
    expect(result.text).toBe("hello");
  });

  it("handles type as plain string", () => {
    setDefaults({
      tts_model: { provider: "elevenlabs", id: "voice-1", name: "Voice 1" }
    });
    const props = { voice: { type: "tts_model", provider: "", id: "", name: "" } };
    const meta = [{ name: "voice", type: "tts_model" }];

    const result = applyDefaultModels(props, meta);
    expect((result.voice as any).provider).toBe("elevenlabs");
  });

  it("handles multiple model properties", () => {
    setDefaults({
      language_model: { provider: "anthropic", id: "claude", name: "Claude" },
      image_model: { provider: "stability", id: "sdxl", name: "SDXL" }
    });
    const props = {
      llm: { type: "language_model", provider: "empty", id: "", name: "" },
      img: { type: "image_model", provider: "empty", id: "", name: "" }
    };
    const meta = [
      { name: "llm", type: { type: "language_model" } },
      { name: "img", type: { type: "image_model" } }
    ];

    const result = applyDefaultModels(props, meta);
    expect((result.llm as any).provider).toBe("anthropic");
    expect((result.img as any).provider).toBe("stability");
  });
});
