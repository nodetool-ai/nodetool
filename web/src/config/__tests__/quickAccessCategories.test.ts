import {
  LEFT_PANEL_TOP_LEVEL,
  NODE_SUBCATEGORIES,
  filterNodesForCategory,
  getNodeSubcategory,
  getTopLevelCategory
} from "../quickAccessCategories";
import type { NodeMetadata, OutputSlot } from "../../stores/ApiTypes";
import type { NodeCategoryId } from "../../stores/PanelStore";

const slot = (kind: string): OutputSlot =>
  ({ name: "output", type: { type: kind } }) as unknown as OutputSlot;

const meta = (
  node_type: string,
  outputKind = "any",
  extra: Partial<NodeMetadata> = {}
): NodeMetadata =>
  ({
    node_type,
    title: node_type.split(".").pop() ?? node_type,
    namespace: node_type.split(".").slice(0, -1).join("."),
    outputs: [slot(outputKind)],
    description: "",
    ...extra
  }) as unknown as NodeMetadata;

const idsIn = (category: NodeCategoryId, all: NodeMetadata[]): string[] =>
  filterNodesForCategory(getNodeSubcategory(category)!, all).map(
    (m) => m.node_type
  );

describe("quickAccessCategories", () => {
  it("ships nine top-level views in order", () => {
    const ids = LEFT_PANEL_TOP_LEVEL.map((c) => c.id);
    expect(ids).toEqual([
      "nodes",
      "workflows",
      "sketches",
      "timelines",
      "settings",
      "history",
      "favorites",
      "assets",
      "library"
    ]);
  });

  it("ships node sub-categories in order, leading with All", () => {
    const ids = NODE_SUBCATEGORIES.map((c) => c.id);
    expect(ids).toEqual([
      "all",
      "io",
      "image",
      "image-ai",
      "video",
      "video-ai",
      "audio",
      "audio-ai",
      "3d-models",
      "agents",
      "control-flow"
    ]);
  });

  it("\"all\" subcategory accepts every node", () => {
    const all = [
      meta("nodetool.image.Resize", "image"),
      meta("openai.agents.Foo", "str"),
      meta("nodetool.control.If", "any")
    ];
    expect(idsIn("all", all).sort()).toEqual([
      "nodetool.control.If",
      "nodetool.image.Resize",
      "openai.agents.Foo"
    ]);
  });

  it("lookup helpers return the right entries", () => {
    expect(getTopLevelCategory("nodes")?.label).toBe("Nodes");
    expect(getNodeSubcategory("image")?.label).toBe("Image");
    expect(getNodeSubcategory("image-ai")?.label).toBe("Image AI");
  });

  it("splits image outputs into non-AI processing and AI models", () => {
    const all = [
      meta("nodetool.image.Resize", "image"), // local processing
      meta("lib.image.Mask", "image_mask"), // local processing
      meta("fal.text_to_image.Flux", "image"), // AI: provider namespace
      meta("nodetool.image.TextToImage", "image", { auto_save_asset: true }), // AI: flag
      meta("c.GenC", "video") // not an image output
    ];
    expect(idsIn("image", all).sort()).toEqual([
      "lib.image.Mask",
      "nodetool.image.Resize"
    ]);
    expect(idsIn("image-ai", all).sort()).toEqual([
      "fal.text_to_image.Flux",
      "nodetool.image.TextToImage"
    ]);
  });

  it("splits video outputs into non-AI processing and AI models", () => {
    const all = [
      meta("nodetool.video.Trim", "video"),
      meta("fal.text_to_video.Veo", "video"),
      meta("nodetool.video.TextToVideo", "video", { auto_save_asset: true })
    ];
    expect(idsIn("video", all)).toEqual(["nodetool.video.Trim"]);
    expect(idsIn("video-ai", all).sort()).toEqual([
      "fal.text_to_video.Veo",
      "nodetool.video.TextToVideo"
    ]);
  });

  it("splits audio outputs into non-AI processing and AI models", () => {
    const all = [
      meta("nodetool.audio.Normalize", "audio"),
      meta("elevenlabs.text_to_speech.Tts", "audio")
    ];
    expect(idsIn("audio", all)).toEqual(["nodetool.audio.Normalize"]);
    expect(idsIn("audio-ai", all)).toEqual(["elevenlabs.text_to_speech.Tts"]);
  });

  it("3d-models matches model_3d outputs (AI and processing together)", () => {
    const all = [
      meta("nodetool.model3d.RepairMesh", "model_3d"),
      meta("fal.text_to_3d.Hunyuan", "model_3d"),
      meta("b.GenB", "image")
    ];
    expect(idsIn("3d-models", all).sort()).toEqual([
      "fal.text_to_3d.Hunyuan",
      "nodetool.model3d.RepairMesh"
    ]);
  });

  it("io matches `nodetool.input.*` and `nodetool.output.*`", () => {
    const all = [
      meta("nodetool.input.StringInput", "str"),
      meta("nodetool.output.Output", "any"),
      meta("nodetool.image.Resize", "image")
    ];
    const ids = idsIn("io", all);
    expect(ids).toContain("nodetool.input.StringInput");
    expect(ids).toContain("nodetool.output.Output");
    expect(ids).not.toContain("nodetool.image.Resize");
  });

  it("control-flow matches `nodetool.control.*`", () => {
    const all = [
      meta("nodetool.control.If", "any"),
      meta("nodetool.control.ForEach", "any"),
      meta("nodetool.image.Resize", "image")
    ];
    const ids = idsIn("control-flow", all);
    expect(ids).toContain("nodetool.control.If");
    expect(ids).toContain("nodetool.control.ForEach");
    expect(ids).not.toContain("nodetool.image.Resize");
  });

  it("agents matches any node under an `*.agents.*` namespace", () => {
    const all = [
      meta("nodetool.agents.Agent", "str"),
      meta("openai.agents.RealtimeAgent", "str"),
      meta("nodetool.image.Resize", "image")
    ];
    const ids = idsIn("agents", all);
    expect(ids).toContain("nodetool.agents.Agent");
    expect(ids).toContain("openai.agents.RealtimeAgent");
    expect(ids).not.toContain("nodetool.image.Resize");
  });
});
