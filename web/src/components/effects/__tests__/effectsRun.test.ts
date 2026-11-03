import { EFFECT_PRESETS } from "../../../lib/presets/catalog";
import { useLastModelStore } from "../../../stores/lastModelStore";
import useModelPreferencesStore from "../../../stores/ModelPreferencesStore";
import {
  buildEffectRequest,
  defaultEffectModel,
  effectModeOf,
  requestModeOf,
  resultKindOf
} from "../effectsRun";

const effect = (id: string) => {
  const preset = EFFECT_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) {
    throw new Error(`missing ${id}`);
  }
  return preset;
};

describe("effect modes", () => {
  it("runs image-to-video effects as generate_media video and edits as image_edit", () => {
    expect(effectModeOf(effect("effect.levitate"))).toBe("image_to_video");
    expect(effectModeOf(effect("effect.claymation"))).toBe("image_edit");
    expect(requestModeOf("image_to_video")).toBe("video");
    expect(requestModeOf("image_edit")).toBe("image_edit");
    expect(resultKindOf("image_to_video")).toBe("video");
    expect(resultKindOf("image_edit")).toBe("image");
  });

  it("covers every effect in the catalogue with one of the two modes", () => {
    expect(EFFECT_PRESETS).toHaveLength(20);
    for (const preset of EFFECT_PRESETS) {
      expect(["image_to_video", "image_edit"]).toContain(effectModeOf(preset));
    }
  });
});

describe("buildEffectRequest", () => {
  it("sends the effect id and the picture, and no compiled text", () => {
    expect(
      buildEffectRequest(
        effect("effect.levitate"),
        { provider: "fake", id: "fake-video" },
        "asset-1"
      )
    ).toEqual({
      mode: "video",
      provider: "fake",
      model: "fake-video",
      prompt: "",
      preset_ids: ["effect.levitate"],
      source_asset_id: "asset-1"
    });
  });

  it("uses image_edit for an editing effect", () => {
    expect(
      buildEffectRequest(
        effect("effect.snow-blanket"),
        { provider: "fake", id: "fake-image" },
        "asset-2"
      )
    ).toMatchObject({ mode: "image_edit", preset_ids: ["effect.snow-blanket"] });
  });
});

describe("defaultEffectModel", () => {
  const videoModels = [
    { id: "a", provider: "p", supported_tasks: ["image_to_video"] },
    { id: "b", provider: "p", supported_tasks: ["image_to_video"] },
    { id: "t2v", provider: "p", supported_tasks: ["text_to_video"] }
  ];

  beforeEach(() => {
    useLastModelStore.setState({ byKind: {}, byTask: {} });
    useModelPreferencesStore.setState({ defaults: {} });
  });

  it("returns null when nothing was picked or set", () => {
    expect(defaultEffectModel("image_to_video", videoModels)).toBeNull();
  });

  it("prefers the task's last model, then the kind's, then the Settings default", () => {
    useModelPreferencesStore.setState({
      defaults: { video_model: { provider: "p", id: "b", name: "b" } }
    });
    expect(defaultEffectModel("image_to_video", videoModels)).toEqual({
      provider: "p",
      id: "b"
    });
    useLastModelStore.getState().remember("video", { provider: "p", model: "a" });
    expect(defaultEffectModel("image_to_video", videoModels)?.id).toBe("a");
    useLastModelStore
      .getState()
      .rememberForTask("video", "image_to_video", { provider: "p", model: "b" });
    expect(defaultEffectModel("image_to_video", videoModels)?.id).toBe("b");
  });

  it("skips a model that no connected provider offers or that cannot do the task", () => {
    useLastModelStore
      .getState()
      .rememberForTask("video", "image_to_video", { provider: "p", model: "gone" });
    useLastModelStore.getState().remember("video", { provider: "p", model: "t2v" });
    useModelPreferencesStore.setState({
      defaults: { video_model: { provider: "p", id: "a", name: "a" } }
    });
    expect(defaultEffectModel("image_to_video", videoModels)?.id).toBe("a");
  });

  it("reads the image kind for an editing effect", () => {
    useLastModelStore
      .getState()
      .rememberForTask("image", "image_edit", { provider: "p", model: "edit" });
    useLastModelStore.getState().remember("video", { provider: "p", model: "a" });
    expect(
      defaultEffectModel("image_edit", [
        { id: "edit", provider: "p", supported_tasks: ["image_to_image"] }
      ])
    ).toEqual({ provider: "p", id: "edit" });
  });
});
