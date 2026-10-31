import { ejectModeFor, ejectPresetIds } from "../ejectPresets";
import { presetCatalog } from "../catalog";

const MODEL = { provider: "fake", id: "fake-video" };

describe("ejectModeFor", () => {
  it("prefers the picture-fed mode for a preset that takes a picture", () => {
    const effect = presetCatalog.getPreset("effect.levitate")!;
    expect(ejectModeFor(effect, "video")).toBe("image_to_video");
    const edit = presetCatalog.getPreset("effect.claymation")!;
    expect(ejectModeFor(edit, "image")).toBe("image_edit");
    expect(ejectModeFor(edit, "video")).toBeNull();
  });

  it("prefers text-to-video for a camera preset", () => {
    expect(ejectModeFor(presetCatalog.getPreset("camera.dolly-in")!, "video")).toBe("video");
  });
});

describe("ejectPresetIds", () => {
  it("ejects one effect as a graph that takes the picture", () => {
    const ejected = ejectPresetIds(["effect.levitate"], "video", MODEL);
    expect(ejected?.mode).toBe("image_to_video");
    const types = ejected?.graph.nodes.map((node) => node.type);
    expect(types).toEqual(
      expect.arrayContaining([
        "nodetool.input.ImageInput",
        "nodetool.video.ImageToVideo",
        "nodetool.output.Output"
      ])
    );
    const template = ejected?.graph.nodes.find((node) => node.id === "template");
    expect(String(template?.data.string)).toContain("levitate");
  });

  it("ejects a stack as the first preset carrying the whole stack's text", () => {
    const ejected = ejectPresetIds(["camera.dolly-in", "camera.handheld"], "video", MODEL);
    expect(ejected?.preset.id).toBe("camera.dolly-in");
    const template = ejected?.graph.nodes.find((node) => node.id === "template");
    const text = String(template?.data.string).toLowerCase();
    expect(text).toContain("dollies");
    expect(text).toContain("handheld");
  });

  it("returns null for an unknown id or a kind the preset cannot make", () => {
    expect(ejectPresetIds(["effect.nope"], "video", MODEL)).toBeNull();
    expect(ejectPresetIds([], "video", MODEL)).toBeNull();
    expect(ejectPresetIds(["effect.claymation"], "video", MODEL)).toBeNull();
  });
});
