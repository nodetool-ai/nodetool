import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import {
  COMFY_LTX23_I2V_MODEL_ID,
  COMFY_MINIMAX_H3_I2V_MODEL_ID,
  COMFY_RESTRICTED_MODELS_ENV,
  COMFY_WAN22_I2V_A14B_MODEL_ID,
  COMFY_WAN22_TI2V_MODEL_ID,
  COMFY_WORKFLOW_MODELS,
  WAN22_TI2V_GRAPH,
  comfyWorkflowModel,
  isComfyWorkflowModel,
  listedComfyWorkflowModels,
  wan22Graph,
  wanCanvas,
  wanFrameCount,
  workflowFrameCount,
  workflowGraph
} from "../../src/providers/comfy-workflow-models.js";
import { ComfyCloudProvider } from "../../src/providers/comfy-cloud-provider.js";

const example = (name: string): unknown => {
  const path = fileURLToPath(
    new URL(`../../../base-nodes/nodetool/examples/nodetool-base/${name}.json`, import.meta.url)
  );
  const workflow = JSON.parse(readFileSync(path, "utf8")) as {
    graph: { nodes: Array<{ type: string; data: { workflow?: string } }> };
  };
  const node = workflow.graph.nodes.find((n) => n.type === "lib.comfy.RunWorkflowOnCloud");
  return JSON.parse(node!.data.workflow!);
};

const model = (id: string) => comfyWorkflowModel(id)!;

afterEach(() => {
  delete process.env[COMFY_RESTRICTED_MODELS_ENV];
});

describe("pinned ComfyUI workflow models", () => {
  it.each([
    [COMFY_WAN22_TI2V_MODEL_ID, "Shot Director"],
    [COMFY_WAN22_I2V_A14B_MODEL_ID, "Shot Director (Wan 2.2 14B)"],
    [COMFY_LTX23_I2V_MODEL_ID, "Shot Director (LTX-2.3)"]
  ])("%s runs the graph its editable example ships", (id, name) => {
    expect(example(name)).toEqual(model(id).graph);
  });

  it("uses core nodes only, never partner API nodes", () => {
    for (const m of COMFY_WORKFLOW_MODELS) {
      const classes = Object.values(m.graph).map((n) => n.class_type);
      expect(classes.filter((c) => /api|partner/i.test(c))).toEqual([]);
      for (const [node, input] of [m.prompt, m.image, ...m.seeds]) {
        expect(m.graph[node].inputs).toHaveProperty(input);
      }
      expect(m.graph[m.video].class_type).toBe("SaveVideo");
    }
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

  it("renders LTX-2.3 at half size before its x2 latent upscale", () => {
    const graph = workflowGraph(model(COMFY_LTX23_I2V_MODEL_ID), {
      prompt: "p",
      seed: 9,
      durationSeconds: 5,
      aspectRatio: "16:9"
    });
    expect(graph["10"].inputs).toMatchObject({ width: 1280, height: 704 });
    expect(graph["12"].inputs).toMatchObject({ width: 640, height: 352, length: 121 });
    expect(graph["14"].inputs.frames_number).toBe(121);
    expect([graph["16"].inputs.noise_seed, graph["26"].inputs.noise_seed]).toEqual([9, 9]);
  });

  it("keeps frame counts on each model's latent grid and within its limit", () => {
    expect(wanFrameCount(5)).toBe(121);
    expect(wanFrameCount(10)).toBe(121);
    expect(wanFrameCount(null)).toBe(121);
    expect((wanFrameCount(2.5) - 1) % 4).toBe(0);
    expect(workflowFrameCount(model(COMFY_WAN22_I2V_A14B_MODEL_ID), 5)).toBe(81);
    expect(workflowFrameCount(model(COMFY_LTX23_I2V_MODEL_ID), 10)).toBe(241);
    expect((workflowFrameCount(model(COMFY_LTX23_I2V_MODEL_ID), 3) - 1) % 8).toBe(0);
    expect(workflowFrameCount(model(COMFY_MINIMAX_H3_I2V_MODEL_ID), 5)).toBe(124);
    expect((workflowFrameCount(model(COMFY_MINIMAX_H3_I2V_MODEL_ID), 7) - 5) % 17).toBe(0);
    expect(wanCanvas("16:9")).toEqual({ width: 1280, height: 704 });
    expect(wanCanvas("1:1")).toEqual({ width: 960, height: 960 });
    expect(wanCanvas(undefined)).toEqual({ width: 1280, height: 704 });
  });

  it("lists MiniMax H3 only when its restricted license is opted into", async () => {
    expect(listedComfyWorkflowModels({}).map((m) => m.id)).toEqual([
      COMFY_WAN22_TI2V_MODEL_ID,
      COMFY_WAN22_I2V_A14B_MODEL_ID,
      COMFY_LTX23_I2V_MODEL_ID
    ]);
    expect(
      listedComfyWorkflowModels({ [COMFY_RESTRICTED_MODELS_ENV]: "1" }).map((m) => m.id)
    ).toContain(COMFY_MINIMAX_H3_I2V_MODEL_ID);
    const h3 = { id: COMFY_MINIMAX_H3_I2V_MODEL_ID, provider: "comfy_cloud", name: "H3" } as never;
    await expect(
      new ComfyCloudProvider({ COMFY_API_KEY: "k" }).imageToVideo(new Uint8Array([1]), {
        model: h3,
        prompt: "p"
      })
    ).rejects.toThrow(COMFY_RESTRICTED_MODELS_ENV);
  });

  it("is listed as image-to-video models ahead of the Router catalog", async () => {
    const provider = new ComfyCloudProvider({});
    const models = await provider.getAvailableVideoModels();
    expect(models.slice(0, 3).map((m) => m.id)).toEqual([
      COMFY_WAN22_TI2V_MODEL_ID,
      COMFY_WAN22_I2V_A14B_MODEL_ID,
      COMFY_LTX23_I2V_MODEL_ID
    ]);
    expect(models[0].supportedTasks).toEqual(["image_to_video"]);
    expect(isComfyWorkflowModel(COMFY_WAN22_TI2V_MODEL_ID)).toBe(true);
    expect(isComfyWorkflowModel("wan/wan2.6-i2v")).toBe(false);
  });

  it("refuses to submit without a key or a still", async () => {
    const wan = { id: COMFY_WAN22_TI2V_MODEL_ID, provider: "comfy_cloud", name: "Wan" } as never;
    await expect(
      new ComfyCloudProvider({}).imageToVideo(new Uint8Array([1]), { model: wan, prompt: "p" })
    ).rejects.toThrow("COMFY_API_KEY");
    await expect(
      new ComfyCloudProvider({ COMFY_API_KEY: "k" }).imageToVideo(new Uint8Array(), {
        model: wan,
        prompt: "p"
      })
    ).rejects.toThrow("still");
  });
});
