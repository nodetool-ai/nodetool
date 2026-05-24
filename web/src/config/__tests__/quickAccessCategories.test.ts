import {
  LEFT_PANEL_TOP_LEVEL,
  NODE_SUBCATEGORIES,
  filterNodesForCategory,
  getNodeSubcategory,
  getTopLevelCategory
} from "../quickAccessCategories";
import type { NodeMetadata, OutputSlot } from "../../stores/ApiTypes";

const slot = (kind: string): OutputSlot =>
  ({ name: "output", type: { type: kind } }) as unknown as OutputSlot;

const meta = (
  node_type: string,
  outputKind = "any",
  title = node_type.split(".").pop() ?? node_type
): NodeMetadata =>
  ({
    node_type,
    title,
    namespace: node_type.split(".").slice(0, -1).join("."),
    outputs: [slot(outputKind)],
    description: ""
  }) as unknown as NodeMetadata;

describe("quickAccessCategories", () => {
  it("ships seven top-level views in order", () => {
    const ids = LEFT_PANEL_TOP_LEVEL.map((c) => c.id);
    expect(ids).toEqual([
      "search",
      "workflows",
      "settings",
      "history",
      "assets",
      "nodes",
      "agent"
    ]);
  });

  it("ships eight node sub-categories in order", () => {
    const ids = NODE_SUBCATEGORIES.map((c) => c.id);
    expect(ids).toEqual([
      "io",
      "tools",
      "image-models",
      "video-models",
      "audio-models",
      "3d-models",
      "agents",
      "control-flow"
    ]);
  });

  it("lookup helpers return the right entries", () => {
    expect(getTopLevelCategory("nodes")?.label).toBe("Nodes");
    expect(getNodeSubcategory("image-models")?.label).toBe("Image");
  });

  it("image-models matches image and image_mask outputs", () => {
    const all = [
      meta("a.GenA", "image"),
      meta("b.GenB", "image_mask"),
      meta("c.GenC", "video"),
      meta("d.GenD", "str")
    ];
    const out = filterNodesForCategory(getNodeSubcategory("image-models")!, all);
    expect(out.map((m) => m.node_type).sort()).toEqual(["a.GenA", "b.GenB"]);
  });

  it("video-models matches only video outputs", () => {
    const all = [meta("a.GenA", "video"), meta("b.GenB", "image")];
    const out = filterNodesForCategory(getNodeSubcategory("video-models")!, all);
    expect(out.map((m) => m.node_type)).toEqual(["a.GenA"]);
  });

  it("audio-models matches only audio outputs", () => {
    const all = [meta("a.GenA", "audio"), meta("b.GenB", "image")];
    const out = filterNodesForCategory(getNodeSubcategory("audio-models")!, all);
    expect(out.map((m) => m.node_type)).toEqual(["a.GenA"]);
  });

  it("3d-models matches model_3d outputs", () => {
    const all = [meta("a.GenA", "model_3d"), meta("b.GenB", "image")];
    const out = filterNodesForCategory(getNodeSubcategory("3d-models")!, all);
    expect(out.map((m) => m.node_type)).toEqual(["a.GenA"]);
  });

  it("io matches `nodetool.input.*` and `nodetool.output.*`", () => {
    const all = [
      meta("nodetool.input.StringInput", "str"),
      meta("nodetool.output.Output", "any"),
      meta("nodetool.image.Resize", "image")
    ];
    const ids = filterNodesForCategory(getNodeSubcategory("io")!, all).map(
      (m) => m.node_type
    );
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
    const ids = filterNodesForCategory(
      getNodeSubcategory("control-flow")!,
      all
    ).map((m) => m.node_type);
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
    const ids = filterNodesForCategory(getNodeSubcategory("agents")!, all).map(
      (m) => m.node_type
    );
    expect(ids).toContain("nodetool.agents.Agent");
    expect(ids).toContain("openai.agents.RealtimeAgent");
    expect(ids).not.toContain("nodetool.image.Resize");
  });

  it("tools matches the curated editing-node list", () => {
    const all = [
      meta("nodetool.image.Crop", "image"),
      meta("nodetool.image.Blur", "image"),
      meta("not.in.tools", "image")
    ];
    const ids = filterNodesForCategory(getNodeSubcategory("tools")!, all).map(
      (m) => m.node_type
    );
    expect(ids).toContain("nodetool.image.Crop");
    expect(ids).toContain("nodetool.image.Blur");
    expect(ids).not.toContain("not.in.tools");
  });

  it("query narrows results by title/node_type/namespace", () => {
    const all = [
      meta("a.GenAlpha", "image", "Alpha generator"),
      meta("a.GenBeta", "image", "Beta generator")
    ];
    const cat = getNodeSubcategory("image-models")!;
    expect(
      filterNodesForCategory(cat, all, "alpha").map((m) => m.node_type)
    ).toEqual(["a.GenAlpha"]);
    expect(
      filterNodesForCategory(cat, all, "beta").map((m) => m.node_type)
    ).toEqual(["a.GenBeta"]);
    expect(filterNodesForCategory(cat, all, "nothing")).toEqual([]);
  });

  it("results are sorted by title", () => {
    const all = [
      meta("a.GenC", "image", "Charlie"),
      meta("a.GenA", "image", "Alpha"),
      meta("a.GenB", "image", "Bravo")
    ];
    const titles = filterNodesForCategory(
      getNodeSubcategory("image-models")!,
      all
    ).map((m) => m.title);
    expect(titles).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("floats generic nodetool nodes above models, then curated popular models", () => {
    const all = [
      meta("zzz.OtherModel", "image", "Zzz Other Model"),
      meta("fal.text_to_image.FluxDev", "image", "Flux Dev"),
      meta("fal.text_to_image.NanoBananaPro", "image", "Nano Banana Pro"),
      meta("nodetool.image.TextToImage", "image", "Text To Image")
    ];
    const ids = filterNodesForCategory(
      getNodeSubcategory("image-models")!,
      all
    ).map((m) => m.node_type);
    expect(ids).toEqual([
      "nodetool.image.TextToImage",
      "fal.text_to_image.NanoBananaPro",
      "fal.text_to_image.FluxDev",
      "zzz.OtherModel"
    ]);
  });

  it("ranking falls back to title sort while searching", () => {
    const all = [
      meta("fal.text_to_image.NanoBananaPro", "image", "Nano Banana Pro"),
      meta("nodetool.image.TextToImage", "image", "Generate via prompt")
    ];
    const ids = filterNodesForCategory(
      getNodeSubcategory("image-models")!,
      all,
      "a"
    ).map((m) => m.node_type);
    expect(ids).toEqual([
      "nodetool.image.TextToImage",
      "fal.text_to_image.NanoBananaPro"
    ]);
  });
});
