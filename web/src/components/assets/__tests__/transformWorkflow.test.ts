import type { Asset, Workflow } from "../../../stores/ApiTypes";
import {
  foldTransformMessage,
  initialTransformRunState,
  transformCandidates,
  transformKindOfAsset,
  transformParams,
  transformProgress,
  transformSourceFromAsset,
  transformSourceFromRef,
  type TransformRunState
} from "../transformWorkflow";

const node = (
  id: string,
  type: string,
  name: string,
  extra: Record<string, unknown> = {}
) => ({ id, type, data: { name }, ...extra });

const workflow = (
  id: string,
  name: string,
  nodes: ReturnType<typeof node>[],
  description: string | null = null
): Workflow =>
  ({ id, name, description, graph: { nodes, edges: [] } }) as unknown as Workflow;

const upscale = workflow("wf-upscale", "Upscale", [
  node("in", "nodetool.input.ImageInput", "image"),
  node("out", "nodetool.output.ImageOutput", "result")
]);
const blend = workflow(
  "wf-blend",
  "Blend",
  [
    node("refs", "nodetool.input.ImageListInput", "references"),
    node("base", "nodetool.input.ImageInput", "base"),
    node("prompt", "nodetool.input.StringInput", "prompt")
  ],
  "Mix a base image with references"
);
const subtitles = workflow("wf-subs", "Subtitles", [
  node("in", "nodetool.input.VideoInput", "video")
]);
const bypassed = workflow("wf-off", "Bypassed", [
  node("in", "nodetool.input.ImageInput", "image", {
    ui_properties: { bypassed: true }
  })
]);

const workflows = [upscale, blend, subtitles, bypassed];

describe("transformKindOfAsset", () => {
  it.each([
    ["image/png", "photo.png", "image"],
    ["video/mp4", "clip.mp4", "video"],
    ["audio/wav", "take.wav", "audio"],
    ["model/gltf-binary", "chair.glb", "model3d"],
    ["application/octet-stream", "chair.glb", "model3d"],
    ["application/pdf", "brief.pdf", "document"],
    ["text/plain", "notes.txt", "document"]
  ])("reads %s (%s) as %s", (contentType, name, kind) => {
    expect(transformKindOfAsset({ content_type: contentType, name })).toBe(kind);
  });

  it("has nothing to transform for a folder", () => {
    expect(transformKindOfAsset({ content_type: "folder", name: "Shots" })).toBeNull();
  });
});

describe("transformCandidates", () => {
  it("offers only workflows with an enabled input of the asset's kind", () => {
    const names = transformCandidates(workflows, "image", "").map(
      (c) => c.workflow.name
    );
    expect(names).toEqual(["Blend", "Upscale"]);
    expect(
      transformCandidates(workflows, "video", "").map((c) => c.workflow.name)
    ).toEqual(["Subtitles"]);
    expect(transformCandidates(workflows, "audio", "")).toEqual([]);
  });

  it("searches by name and description", () => {
    expect(
      transformCandidates(workflows, "image", "UPSC").map((c) => c.workflow.id)
    ).toEqual(["wf-upscale"]);
    expect(
      transformCandidates(workflows, "image", "references").map((c) => c.workflow.id)
    ).toEqual(["wf-blend"]);
  });

  it("puts a single-value input before a list input", () => {
    const [candidate] = transformCandidates(workflows, "image", "blend");
    expect(candidate.inputs.map((i) => [i.input.name, i.list])).toEqual([
      ["base", false],
      ["references", true]
    ]);
  });
});

describe("transformParams", () => {
  const asset = {
    id: "a1b2c3",
    name: "Miso.png",
    content_type: "image/png",
    parent_id: "folder-1",
    project_id: "project-1"
  } as Asset;
  const source = transformSourceFromAsset(asset);

  it("keeps the asset's folder and project for saved outputs", () => {
    expect(source).toMatchObject({ parentId: "folder-1", projectId: "project-1" });
  });

  it("feeds the asset as a ref to the chosen input", () => {
    const [candidate] = transformCandidates(workflows, "image", "upscale");
    expect(transformParams(source!, candidate.inputs[0])).toEqual({
      image: { type: "image", uri: "asset://a1b2c3", asset_id: "a1b2c3" }
    });
  });

  it("wraps the ref in a list for a list input", () => {
    const [candidate] = transformCandidates(workflows, "image", "blend");
    expect(transformParams(source!, candidate.inputs[1])).toEqual({
      references: [{ type: "image", uri: "asset://a1b2c3", asset_id: "a1b2c3" }]
    });
  });
});

describe("transformSourceFromRef", () => {
  it("uses the asset behind a stored ref", () => {
    expect(
      transformSourceFromRef({ uri: "asset://k1.png", asset_id: "k1" }, "image", "Still")
    ).toEqual({ kind: "image", name: "Still", uri: "asset://k1", assetId: "k1" });
  });

  it("keeps the URI of media without an asset, and feeds it without an asset id", () => {
    const source = transformSourceFromRef(
      { uri: "data:image/png;base64,AAAA" },
      "image",
      "Sketch"
    );
    expect(source).toEqual({ kind: "image", name: "Sketch", uri: "data:image/png;base64,AAAA" });
    const [candidate] = transformCandidates(workflows, "image", "upscale");
    expect(transformParams(source!, candidate.inputs[0])).toEqual({
      image: { type: "image", uri: "data:image/png;base64,AAAA" }
    });
  });

  it("is null for a ref without media", () => {
    expect(transformSourceFromRef({}, "video", "Clip")).toBeNull();
  });
});

describe("foldTransformMessage", () => {
  const running: TransformRunState = {
    ...initialTransformRunState,
    status: "running",
    jobId: "job-1",
    totalNodes: 2
  };

  it("tracks node status and overall progress", () => {
    let state = foldTransformMessage(running, {
      type: "node_update",
      node_id: "in",
      node_name: "image",
      status: "running"
    });
    state = foldTransformMessage(state, {
      type: "node_update",
      node_id: "in",
      node_name: "image",
      status: "completed"
    });
    expect(state.updates).toEqual([
      { nodeId: "in", nodeName: "image", status: "completed", error: undefined }
    ]);
    expect(transformProgress(state)).toBe(50);
  });

  it("reports a running node's own progress", () => {
    const state = foldTransformMessage(running, {
      type: "node_progress",
      node_id: "gen",
      progress: 3,
      total: 4
    });
    expect(state.nodeProgress).toEqual({ nodeId: "gen", percent: 75 });
  });

  it("splits a list of media into one output per item and keeps asset ids", () => {
    const state = foldTransformMessage(running, {
      type: "output_update",
      node_id: "out",
      node_name: "result",
      value: [
        { type: "image", uri: "asset://img1.png", asset_id: "img1" },
        { type: "image", uri: "/api/storage/u/tmp.png" }
      ]
    });
    expect(
      state.outputs.map((o) => [o.key, o.kind, o.assetId])
    ).toEqual([
      ["out:0", "image", "img1"],
      ["out:1", "image", undefined]
    ]);
  });

  it("replaces a node's media output when it is emitted again", () => {
    const first = foldTransformMessage(running, {
      type: "output_update",
      node_id: "out",
      node_name: "result",
      value: { type: "image", uri: "asset://a.png" }
    });
    const second = foldTransformMessage(first, {
      type: "output_update",
      node_id: "out",
      node_name: "result",
      value: { type: "image", uri: "asset://b.png" }
    });
    expect(second.outputs).toHaveLength(1);
    expect(second.outputs[0].assetId).toBe("b");
  });

  it("joins streamed text chunks", () => {
    let state = foldTransformMessage(running, {
      type: "output_update",
      node_id: "caption",
      node_name: "caption",
      value: "A cat "
    });
    state = foldTransformMessage(state, {
      type: "output_update",
      node_id: "caption",
      node_name: "caption",
      value: "on a mat"
    });
    expect(state.outputs).toEqual([
      expect.objectContaining({ value: "A cat on a mat", kind: null })
    ]);
  });
});
