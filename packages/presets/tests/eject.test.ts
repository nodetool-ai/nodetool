import { describe, expect, it } from "vitest";
import { compilePresets, createCatalog, presetSchema, presetToWorkflow } from "../src/index.js";

const model = { provider: "fake", id: "veo-3", path: "/models/local" };
const preset = presetSchema.parse({
  id: "camera.test", version: 1, kind: "camera", name: "Test", description: "Test",
  modes: ["video", "image_to_video", "reference_to_video", "image", "image_edit"],
  prompt: { default: "Fallback", veo: { prefix: "Start", suffix: "End" } }, params: { duration: 5 }
});

describe("presetToWorkflow", () => {
  it.each(preset.modes)("builds %s with the shared compile and selected model", (mode) => {
    const graph = presetToWorkflow(preset, { model, mode });
    expect(graph.nodes.find(n => n.id === "template")?.data.string).toBe(
      compilePresets([preset.id], { catalog: createCatalog([preset]), mode, modelId: model.id, prompt: "{{ prompt }}" }).prompt
    );
    expect(graph.nodes.find(n => n.id === "generate")?.data).toMatchObject({ duration: 5, model });
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: "prompt", target: "template", targetHandle: "prompt" }));
  });
  it("preserves replace fragments", () => {
    const graph = presetToWorkflow({ ...preset, prompt: { default: { replace: "Fixed direction" } } }, { model, mode: "video" });
    expect(graph.nodes.find(n => n.id === "template")?.data.string).toBe("Fixed direction");
  });
  it("rejects unsupported modes", () => {
    expect(() => presetToWorkflow({ ...preset, modes: ["image"] }, { model, mode: "video" })).toThrow(/does not support/);
  });
  it("resolves a named graph and returns an independent editable copy", () => {
    const named = { ...preset, workflow: "hand-built" };
    const graph = presetToWorkflow(preset, { model, mode: "video" });
    expect(() => presetToWorkflow(named, { model, mode: "video" })).toThrow(/resolver/);
    const result = presetToWorkflow(named, { model, mode: "video", resolveWorkflow: name => {
      expect(name).toBe("hand-built");
      return graph;
    } });
    expect(result).toEqual(graph);
    expect(result).not.toBe(graph);
  });
});

describe("video restyles", () => {
  it("connects a video source to the video-to-video generator", () => {
    const restyle = presetSchema.parse({
      id: "effect.restyle-test", version: 1, kind: "effect", name: "Restyle test",
      description: "Restyle", modes: ["video_edit"], inputs: ["video"],
      prompt: { default: "Paint every frame." }
    });
    const graph = presetToWorkflow(restyle, { model, mode: "video_edit" });
    expect(graph.nodes.find(node => node.id === "video")?.type).toBe("nodetool.input.VideoInput");
    expect(graph.nodes.find(node => node.id === "generate")?.type).toBe("nodetool.video.VideoToVideo");
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: "video", target: "generate", targetHandle: "video" }));
  });
});
