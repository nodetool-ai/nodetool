import { comfyStarterGraph, pickStarterCheckpoint } from "../comfyStarterGraph";

const inputs = (graph: ReturnType<typeof comfyStarterGraph>, type: string) =>
  graph.nodes.find((node) => node.type === `comfy.${type}`)?.data as Record<string, unknown>;

describe("pickStarterCheckpoint", () => {
  it("prefers an SDXL base over a refiner and an SD 1.5 file", () => {
    expect(
      pickStarterCheckpoint([
        "dreamshaper_8.safetensors",
        "sd_xl_refiner_1.0.safetensors",
        "sd_xl_base_1.0.safetensors"
      ])
    ).toBe("sd_xl_base_1.0.safetensors");
  });

  it("falls back to the first file that is not a refiner", () => {
    expect(
      pickStarterCheckpoint(["sd_xl_refiner_1.0.safetensors", "dreamshaper_8.safetensors"])
    ).toBe("dreamshaper_8.safetensors");
  });

  it("returns undefined for an empty folder", () => {
    expect(pickStarterCheckpoint([])).toBeUndefined();
  });
});

describe("comfyStarterGraph", () => {
  it("starts on FLUX.1 schnell by default", () => {
    const graph = comfyStarterGraph();
    expect(inputs(graph, "CheckpointLoaderSimple").ckpt_name).toBe("flux1-schnell-fp8.safetensors");
    expect(inputs(graph, "KSampler").steps).toBe(4);
  });

  it("uses the server's checkpoint with settings for its family", () => {
    const graph = comfyStarterGraph({ checkpoint: "juggernautXL_ragnarokBy.safetensors" });
    expect(inputs(graph, "CheckpointLoaderSimple").ckpt_name).toBe(
      "juggernautXL_ragnarokBy.safetensors"
    );
    expect(inputs(graph, "KSampler")).toMatchObject({ steps: 25, cfg: 7, scheduler: "normal" });
  });
});
