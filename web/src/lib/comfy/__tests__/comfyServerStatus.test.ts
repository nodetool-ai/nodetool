import {
  describeComfyModels,
  describeComfyServer,
  type ComfyServerStatus
} from "../comfyServerStatus";

const status = (overrides: Partial<ComfyServerStatus> = {}): ComfyServerStatus => ({
  url: "http://127.0.0.1:8188",
  version: "0.3.68",
  device: "cuda:0 NVIDIA GeForce RTX 4070 Ti SUPER : cudaMallocAsync",
  models: {
    checkpoints: ["a.safetensors", "b.safetensors"],
    diffusion_models: ["wan.safetensors"],
    loras: []
  },
  ...overrides
});

describe("describeComfyServer", () => {
  it("names the version and the GPU", () => {
    expect(describeComfyServer(status())).toBe("ComfyUI 0.3.68 on NVIDIA GeForce RTX 4070 Ti SUPER");
  });

  it("drops what the server does not report", () => {
    expect(describeComfyServer(status({ version: null, device: null }))).toBe("ComfyUI");
  });
});

describe("describeComfyModels", () => {
  it("counts each folder", () => {
    expect(describeComfyModels(status())).toBe("2 checkpoints, 1 diffusion model, 0 LoRAs");
  });

  it("is null when the server lists no folders", () => {
    expect(
      describeComfyModels(
        status({ models: { checkpoints: null, diffusion_models: null, loras: null } })
      )
    ).toBeNull();
  });
});
