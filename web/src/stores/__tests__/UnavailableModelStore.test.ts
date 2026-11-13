import {
  UNAVAILABLE_MODEL_TTL_MS,
  isModelUnavailable,
  useUnavailableModelStore,
  withoutUnavailableModels
} from "../UnavailableModelStore";

describe("UnavailableModelStore", () => {
  beforeEach(() => {
    useUnavailableModelStore.getState().clear();
  });

  it("leaves a refused model out of a picker's list", () => {
    useUnavailableModelStore.getState().markUnavailable("Gemini", "gemini-2.5-pro", 1000);
    const { refusedAt } = useUnavailableModelStore.getState();
    const models = [
      { id: "gemini-2.5-pro", provider: "gemini" },
      { id: "gemini-3.1-flash", provider: "gemini" },
      { id: "gemini-2.5-pro", provider: "openrouter" },
      { name: "no id or provider" }
    ];
    expect(withoutUnavailableModels(models, refusedAt, 2000)).toEqual([
      { id: "gemini-3.1-flash", provider: "gemini" },
      { id: "gemini-2.5-pro", provider: "openrouter" },
      { name: "no id or provider" }
    ]);
  });

  it("offers the model again once the refusal expires", () => {
    useUnavailableModelStore.getState().markUnavailable("gemini", "veo-3.1-generate-preview", 0);
    const { refusedAt } = useUnavailableModelStore.getState();
    expect(isModelUnavailable(refusedAt, "gemini", "veo-3.1-generate-preview", 10)).toBe(true);
    expect(
      isModelUnavailable(refusedAt, "gemini", "veo-3.1-generate-preview", UNAVAILABLE_MODEL_TTL_MS)
    ).toBe(false);
  });

  it("forgets every refusal when cleared after a key change", () => {
    useUnavailableModelStore.getState().markUnavailable("gemini", "gemini-2.5-pro");
    useUnavailableModelStore.getState().clear();
    expect(useUnavailableModelStore.getState().refusedAt).toEqual({});
  });
});
