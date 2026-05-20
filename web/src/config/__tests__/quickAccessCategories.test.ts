import {
  QUICK_ACCESS_CATEGORIES,
  filterNodesForCategory,
  getCategory
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
  it("ships twelve categories in order", () => {
    const ids = QUICK_ACCESS_CATEGORIES.map((c) => c.id);
    expect(ids).toEqual([
      "search",
      "history",
      "workflows",
      "assets",
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

  it("getCategory returns the category by id", () => {
    expect(getCategory("image-models")?.label).toBe("Image Models");
    expect(getCategory("search")?.kind).toBe("panel");
    expect(getCategory("image-models")?.kind).toBe("tile-grid");
  });

  it("panel-kind categories return empty filter results", () => {
    const all = [meta("foo.bar", "image")];
    expect(filterNodesForCategory(getCategory("search")!, all)).toEqual([]);
    expect(filterNodesForCategory(getCategory("workflows")!, all)).toEqual([]);
    expect(filterNodesForCategory(getCategory("assets")!, all)).toEqual([]);
  });

  it("image-models matches image and image_mask outputs", () => {
    const all = [
      meta("a.GenA", "image"),
      meta("b.GenB", "image_mask"),
      meta("c.GenC", "video"),
      meta("d.GenD", "str")
    ];
    const out = filterNodesForCategory(getCategory("image-models")!, all);
    expect(out.map((m) => m.node_type).sort()).toEqual(["a.GenA", "b.GenB"]);
  });

  it("video-models matches only video outputs", () => {
    const all = [meta("a.GenA", "video"), meta("b.GenB", "image")];
    const out = filterNodesForCategory(getCategory("video-models")!, all);
    expect(out.map((m) => m.node_type)).toEqual(["a.GenA"]);
  });

  it("audio-models matches only audio outputs", () => {
    const all = [meta("a.GenA", "audio"), meta("b.GenB", "image")];
    const out = filterNodesForCategory(getCategory("audio-models")!, all);
    expect(out.map((m) => m.node_type)).toEqual(["a.GenA"]);
  });

  it("3d-models matches model_3d outputs", () => {
    const all = [meta("a.GenA", "model_3d"), meta("b.GenB", "image")];
    const out = filterNodesForCategory(getCategory("3d-models")!, all);
    expect(out.map((m) => m.node_type)).toEqual(["a.GenA"]);
  });

  it("io matches `nodetool.input.*` and `nodetool.output.*`", () => {
    const all = [
      meta("nodetool.input.StringInput", "str"),
      meta("nodetool.output.Output", "any"),
      meta("nodetool.image.Resize", "image")
    ];
    const ids = filterNodesForCategory(getCategory("io")!, all).map(
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
    const ids = filterNodesForCategory(getCategory("control-flow")!, all).map(
      (m) => m.node_type
    );
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
    const ids = filterNodesForCategory(getCategory("agents")!, all).map(
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
    const ids = filterNodesForCategory(getCategory("tools")!, all).map(
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
    const cat = getCategory("image-models")!;
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
      getCategory("image-models")!,
      all
    ).map((m) => m.title);
    expect(titles).toEqual(["Alpha", "Bravo", "Charlie"]);
  });
});
