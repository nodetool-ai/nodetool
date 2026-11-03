import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  COMFY_WAN22_TI2V_MODEL_ID,
  WAN22_TI2V_GRAPH,
  isComfyWorkflowModel,
  wan22Graph,
  wanCanvas,
  wanFrameCount
} from "../../src/providers/comfy-workflow-models.js";
import { ComfyCloudProvider } from "../../src/providers/comfy-cloud-provider.js";

const SHOT_DIRECTOR = fileURLToPath(
  new URL(
    "../../../base-nodes/nodetool/examples/nodetool-base/Shot Director.json",
    import.meta.url
  )
);

describe("pinned Wan 2.2 ComfyUI workflow", () => {
  it("is the same graph the editable Shot Director example ships", () => {
    const example = JSON.parse(readFileSync(SHOT_DIRECTOR, "utf8")) as {
      graph: { nodes: Array<{ type: string; data: { workflow?: string } }> };
    };
    const node = example.graph.nodes.find(
      (n) => n.type === "lib.comfy.RunWorkflowOnCloud"
    );
    expect(node?.data.workflow).toBeDefined();
    expect(JSON.parse(node!.data.workflow!)).toEqual(WAN22_TI2V_GRAPH);
  });

  it("uses core nodes and open Wan 2.2 weights only", () => {
    const classes = Object.values(WAN22_TI2V_GRAPH).map((n) => n.class_type);
    expect(classes.every((c) => !/api|partner/i.test(c))).toBe(true);
    expect(WAN22_TI2V_GRAPH["37"].inputs.unet_name).toBe("wan2.2_ti2v_5B_fp16.safetensors");
  });

  it("writes the shot's prompt, seed, size and length into the graph", () => {
    const graph = wan22Graph({
      prompt: "A cup on a table. The camera glides forward.",
      seed: 7,
      durationSeconds: 3,
      aspectRatio: "9:16"
    });
    expect(graph["6"].inputs.text).toBe("A cup on a table. The camera glides forward.");
    expect(graph["3"].inputs.seed).toBe(7);
    expect(graph["55"].inputs).toMatchObject({ width: 704, height: 1280, length: 73 });
    // The pinned graph itself is never mutated.
    expect(WAN22_TI2V_GRAPH["6"].inputs.text).toBe("A cinematic shot.");
  });

  it("keeps frame counts on Wan's 4n+1 grid and within 121", () => {
    expect(wanFrameCount(5)).toBe(121);
    expect(wanFrameCount(10)).toBe(121);
    expect(wanFrameCount(null)).toBe(121);
    expect((wanFrameCount(2.5) - 1) % 4).toBe(0);
    expect(wanCanvas("16:9")).toEqual({ width: 1280, height: 704 });
    expect(wanCanvas("1:1")).toEqual({ width: 960, height: 960 });
    expect(wanCanvas(undefined)).toEqual({ width: 1280, height: 704 });
  });

  it("is listed as an image-to-video model next to the Router catalog", async () => {
    const provider = new ComfyCloudProvider({});
    const models = await provider.getAvailableVideoModels();
    expect(models[0]).toMatchObject({
      id: COMFY_WAN22_TI2V_MODEL_ID,
      supportedTasks: ["image_to_video"]
    });
    expect(isComfyWorkflowModel(COMFY_WAN22_TI2V_MODEL_ID)).toBe(true);
    expect(isComfyWorkflowModel("wan/wan2.6-i2v")).toBe(false);
  });

  it("refuses to submit without a key or a still", async () => {
    const model = { id: COMFY_WAN22_TI2V_MODEL_ID, provider: "comfy_cloud", name: "Wan" } as never;
    await expect(
      new ComfyCloudProvider({}).imageToVideo(new Uint8Array([1]), { model, prompt: "p" })
    ).rejects.toThrow("COMFY_API_KEY");
    await expect(
      new ComfyCloudProvider({ COMFY_API_KEY: "k" }).imageToVideo(new Uint8Array(), { model, prompt: "p" })
    ).rejects.toThrow("still");
  });
});
