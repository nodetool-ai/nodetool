import { describe, it, expect } from "vitest";
import { fetchComfyServerStatus } from "../src/nodes/comfy-server-status.js";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });

describe("fetchComfyServerStatus", () => {
  it("reports version, device and the model folders", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      seen.push(url);
      if (url.endsWith("/system_stats")) {
        return json({
          system: { comfyui_version: "0.3.68" },
          devices: [{ name: "cuda:0 NVIDIA GeForce RTX 4070" }]
        });
      }
      if (url.endsWith("/models/checkpoints")) {
        return json(["sd_xl_base_1.0.safetensors", "dreamshaper_8.safetensors"]);
      }
      if (url.endsWith("/models/loras")) {
        return json(["detail.safetensors"]);
      }
      return json({ error: "not found" }, 404);
    }) as typeof fetch;

    const status = await fetchComfyServerStatus("127.0.0.1:8188/", { fetchImpl });

    expect(status).toEqual({
      url: "http://127.0.0.1:8188",
      version: "0.3.68",
      device: "cuda:0 NVIDIA GeForce RTX 4070",
      models: {
        checkpoints: ["sd_xl_base_1.0.safetensors", "dreamshaper_8.safetensors"],
        diffusion_models: null,
        loras: ["detail.safetensors"]
      }
    });
    expect(seen).toContain("http://127.0.0.1:8188/system_stats");
  });

  it("says nothing answered when the connection fails", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    await expect(
      fetchComfyServerStatus("http://127.0.0.1:8188", { fetchImpl })
    ).rejects.toThrow(/Nothing answered at http:\/\/127\.0\.0\.1:8188\. Start ComfyUI/);
  });

  it("says the address may not be ComfyUI on an HTTP error", async () => {
    const fetchImpl = (async () => json({}, 404)) as typeof fetch;
    await expect(
      fetchComfyServerStatus("http://127.0.0.1:8188", { fetchImpl })
    ).rejects.toThrow(/HTTP 404\. It may not be a ComfyUI server/);
  });
});
