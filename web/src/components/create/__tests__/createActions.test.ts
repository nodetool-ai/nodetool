import type { CreateFeedItem } from "../createFeed";
import {
  canOpenAsWorkflow,
  generationToWorkflowGraph,
  retakeRequest
} from "../createActions";

const item = (overrides: Partial<CreateFeedItem> = {}): CreateFeedItem => ({
  key: "g:a",
  kind: "video",
  status: "generated",
  prompt: "dolly in",
  model: "wan",
  presetIds: [],
  assetId: "a",
  asset: null,
  createdAt: 1,
  error: null,
  generation: null,
  request: { mode: "video", provider: "fake", model: "wan-2.2", duration: 5, seed: 11 },
  ...overrides
});

const templateText = (graph: ReturnType<typeof generationToWorkflowGraph>): string => {
  const template = graph.nodes.find((node) => node.id === "template");
  return String((template?.data as { string?: string } | undefined)?.string ?? "");
};

describe("retakeRequest", () => {
  it("resends the settings and prompt with a new seed and the same presets", () => {
    const request = retakeRequest(item({ presetIds: ["camera.arc"] }));
    expect(request).toMatchObject({
      mode: "video",
      provider: "fake",
      model: "wan-2.2",
      duration: 5,
      prompt: "dolly in",
      preset_ids: ["camera.arc"]
    });
    expect(request?.seed).not.toBe(11);
  });

  it("returns null when the settings are unknown", () => {
    expect(retakeRequest(item({ request: null }))).toBeNull();
  });
});

describe("open as workflow", () => {
  it("is offered only for a generation that carries presets", () => {
    expect(canOpenAsWorkflow(item())).toBe(false);
    expect(canOpenAsWorkflow(item({ presetIds: ["camera.arc"] }))).toBe(true);
    expect(canOpenAsWorkflow(item({ presetIds: ["camera.arc"], request: null }))).toBe(false);
  });

  it("builds the graph presetToWorkflow returns for one preset", () => {
    const graph = generationToWorkflowGraph(item({ presetIds: ["camera.arc"] }));
    expect(graph.nodes.map((node) => node.id)).toEqual([
      "prompt",
      "template",
      "generate",
      "output"
    ]);
    expect(templateText(graph)).toContain("{{ prompt }}");
    const generate = graph.nodes.find((node) => node.id === "generate");
    expect(generate?.type).toBe("nodetool.video.TextToVideo");
    expect(generate?.ui_properties).toEqual({ position: { x: 680, y: 80 } });
  });

  it("compiles a stack into the template", () => {
    const single = generationToWorkflowGraph(item({ presetIds: ["camera.arc"] }));
    const stacked = generationToWorkflowGraph(
      item({ presetIds: ["camera.arc", "camera.speed-ramp"] })
    );
    expect(templateText(stacked).length).toBeGreaterThan(templateText(single).length);
  });

  it("refuses a preset the catalogue no longer ships", () => {
    expect(() =>
      generationToWorkflowGraph(item({ presetIds: ["camera.gone"] }))
    ).toThrow("camera.gone");
  });
});

it("ejects a restyle to VideoToVideo with the source video and original prompt", () => {
  const graph = generationToWorkflowGraph(item({ prompt: "A neon street", presetIds: ["effect.restyle-anime"], request: { mode: "video_edit", provider: "fake", model: "fake-video", source_asset_id: "0123456789abcdef0123456789abcdef" } }));
  expect(graph.nodes.find(n => n.id === "generate")?.type).toBe("nodetool.video.VideoToVideo");
  expect((graph.nodes.find(n => n.id === "prompt")?.data as Record<string, unknown>).value).toBe("A neon street");
  expect((graph.nodes.find(n => n.id === "video")?.data as Record<string, unknown>).value).toEqual({ type: "video", asset_id: "0123456789abcdef0123456789abcdef" });
});
