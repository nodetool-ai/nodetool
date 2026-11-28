import { renderHook } from "@testing-library/react";
import useMediaGenerationStore from "../../../stores/MediaGenerationStore";
import useModelPreferencesStore from "../../../stores/ModelPreferencesStore";
import { useCreateModelDefaults } from "../useCreateModelDefaults";

const editModels = [
  { type: "image_model", id: "edit-a", provider: "fal", name: "Edit A" },
  { type: "image_model", id: "edit-b", provider: "openai", name: "Edit B" }
];

jest.mock("../../../hooks/useModelsByProvider", () => ({
  useImageModelsByProvider: ({ task }: { task: string }) => ({
    isLoading: false,
    models: task === "image_to_image" ? editModels : []
  }),
  useVideoModelsByProvider: () => ({ isLoading: false, models: [] })
}));

jest.mock("../../../hooks/useModelAvailability", () => ({
  useModelAvailability: () => (model: { provider?: string }) => ({
    available: model.provider === "openai"
  })
}));

jest.mock("../../../hooks/useSeedDefaultModels", () => ({
  pickSeedModel: <T,>(models: readonly T[], isAvailable: (m: T) => boolean) =>
    models.find(isAvailable) ?? null
}));

describe("useCreateModelDefaults in image_edit", () => {
  beforeEach(() => {
    useMediaGenerationStore.getState().setImageEditParams({ model: null });
  });

  it("starts on an editing model of a connected provider", () => {
    renderHook(() => useCreateModelDefaults("image_edit"));
    expect(useMediaGenerationStore.getState().imageEdit.model).toMatchObject({
      id: "edit-b",
      provider: "openai"
    });
  });

  it("never replaces a model the person picked", () => {
    useMediaGenerationStore.getState().setImageEditParams({
      model: { type: "image_model", id: "edit-a", provider: "fal", name: "Edit A", path: "" }
    });
    renderHook(() => useCreateModelDefaults("image_edit"));
    expect(useMediaGenerationStore.getState().imageEdit.model?.id).toBe("edit-a");
  });

  it("leaves other modes alone", () => {
    useModelPreferencesStore.setState({ defaults: {} } as never);
    renderHook(() => useCreateModelDefaults("image"));
    expect(useMediaGenerationStore.getState().imageEdit.model).toBeNull();
  });
});
