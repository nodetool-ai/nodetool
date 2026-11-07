import { readFileSync } from "node:fs";
import { buildComfyPrompt, COMFY_RUN_MODE } from "@nodetool-ai/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COMFY_TEMPLATES,
  comfyTemplate,
  comfyTemplateGraph,
  listedComfyTemplates,
  runComfyTemplate
} from "../../src/providers/comfy-template-models.js";
import { COMFY_RESTRICTED_MODELS_ENV } from "../../src/providers/comfy-workflow-models.js";
import { ComfyCloudProvider } from "../../src/providers/comfy-cloud-provider.js";

const sdk = vi.hoisted(() => ({
  fromJson: vi.fn(), submit: vi.fn(), wait: vi.fn(), cancel: vi.fn(), getOutputs: vi.fn()
}));
vi.mock("@comfyorg/sdk", () => ({
  Comfy: class {
    workflows = { fromJson: sdk.fromJson };
    submit = sdk.submit;
  }
}));

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

function template(source: string) {
  const result = comfyTemplate(`comfyui-template/${source}`);
  if (!result) throw new Error(`Missing template ${source}`);
  return result;
}

function completedJob(kind: "image" | "video") {
  sdk.fromJson.mockImplementation((graph) => graph);
  sdk.wait.mockResolvedValue(undefined);
  sdk.cancel.mockResolvedValue(undefined);
  sdk.getOutputs.mockReturnValue([{ contentType: `${kind}/test`, toBytes: async () => new Uint8Array([1, 2, 3]) }]);
  sdk.submit.mockResolvedValue({ id: "job-1", status: "succeeded", wait: sdk.wait, cancel: sdk.cancel, getOutputs: sdk.getOutputs });
}

describe("official Comfy API templates", () => {
  it("ships every selected upstream API graph with valid links and editable examples", () => {
    expect(COMFY_TEMPLATES.length).toBeGreaterThan(0);
    for (const t of COMFY_TEMPLATES) {
      const original = JSON.parse(readFileSync(new URL(`../fixtures/comfy-templates/${t.source}.json`, import.meta.url), "utf8"));
      expect(Object.keys(t.graph)).toHaveLength(Object.keys(original).length);
      for (const [id, node] of Object.entries(t.graph)) {
        expect(id).not.toContain(":");
        expect(node.class_type).toBe(original[id.replaceAll("_", ":")]?.class_type);
        for (const value of Object.values(node.inputs)) {
          if (Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && Number.isInteger(value[1])) {
            expect(t.graph[value[0]], `${t.source}: ${value[0]}`).toBeDefined();
          }
        }
      }
      for (const [node, input] of [...t.prompt, ...t.seeds]) {
        expect(t.graph[node].inputs).toHaveProperty(input);
      }
      if (!t.restricted) {
        const example = JSON.parse(readFileSync(new URL(`../../../base-nodes/nodetool/examples/nodetool-base/Comfy ${t.name}.json`, import.meta.url), "utf8"));
        expect(example.run_mode).toBe(COMFY_RUN_MODE);
        expect(example.graph.nodes.filter((n: { type: string }) => n.type.startsWith("comfy."))).toHaveLength(Object.keys(t.graph).length);
        expect(example.graph.nodes.some((n: { type: string }) => n.type === "lib.comfy.RunWorkflowOnCloud")).toBe(false);
        const sockets: Record<string, Record<string, string[]>> = JSON.parse(readFileSync(new URL("../fixtures/comfy-templates/sockets.json", import.meta.url), "utf8"));
        const rebuilt = buildComfyPrompt(example.graph, (cls) => sockets[t.source][cls]);
        expect(rebuilt).toEqual(t.graph);
      }
    }
  });

  it("injects caller prompts, seeds and image size without mutating the template", () => {
    const t = template("image_z_image_turbo");
    const original = structuredClone(t.graph);
    const graph = comfyTemplateGraph(t, { prompt: "A lighthouse", seed: 7, width: 800, height: 640 });
    expect(graph["57_27"].inputs.text).toBe("A lighthouse");
    expect(graph["57_3"].inputs.seed).toBe(7);
    expect(graph["57_13"].inputs).toMatchObject({ width: 800, height: 640 });
    expect(t.graph).toEqual(original);
  });

  it.each(COMFY_TEMPLATES.filter((t) => t.task === "text_to_video"))("keeps $name on its frame grid and limit", (t) => {
    if (t.task !== "text_to_video") throw new Error("Expected video template");
    for (const frames of [1, 37, 999999]) {
      const graph = comfyTemplateGraph(t, { prompt: "p", numFrames: frames, aspectRatio: "9:16" });
      const { width, height, length } = graph[t.size].inputs;
      expect(Number(width)).toBeLessThan(Number(height));
      expect(Number(length)).toBeLessThanOrEqual(t.maxFrames);
      expect((Number(length) - t.offset) % t.grid).toBe(0);
    }
  });

  it("rejects invalid aspect ratios", () => {
    expect(() => comfyTemplateGraph(template("image_z_image_turbo"), { prompt: "p", aspectRatio: "Infinity:1" })).toThrow("aspect ratio");
  });

  it("keeps H3 templates behind the existing model opt-in", async () => {
    vi.stubEnv(COMFY_RESTRICTED_MODELS_ENV, "");
    expect(listedComfyTemplates({}).some((t) => t.restricted)).toBe(false);
    expect(listedComfyTemplates({ [COMFY_RESTRICTED_MODELS_ENV]: "1" })).toEqual(COMFY_TEMPLATES);
    await expect(runComfyTemplate(template("video_minimax_h3_t2v"), "key", { prompt: "p" })).rejects.toThrow(COMFY_RESTRICTED_MODELS_ENV);
    expect(sdk.submit).not.toHaveBeenCalled();
  });

  it("routes image and video models to graph jobs and reads the designated output", async () => {
    const provider = new ComfyCloudProvider({ COMFY_API_KEY: "key" });
    completedJob("image");
    const image = template("image_z_image_turbo");
    await expect(provider.textToImage({ model: { id: image.id, provider: "comfy_cloud", name: image.name }, prompt: "p" })).resolves.toEqual(new Uint8Array([1, 2, 3]));
    expect(sdk.getOutputs).toHaveBeenCalledWith(image.output);
    completedJob("video");
    const video = template("video_wan2_2_14B_t2v");
    await expect(provider.textToVideo({ model: { id: video.id, provider: "comfy_cloud", name: video.name }, prompt: "p" })).resolves.toEqual(new Uint8Array([1, 2, 3]));
    expect(sdk.getOutputs).toHaveBeenCalledWith(video.output);
    expect(sdk.submit).toHaveBeenCalledTimes(2);
    for (const call of sdk.submit.mock.calls) {expect(call[1]).toMatchObject({ apiKey: "key" });}
  });

  it("cancels a job when abort arrives during submission", async () => {
    completedJob("image");
    const controller = new AbortController();
    const job = await sdk.submit();
    sdk.submit.mockImplementation(async () => { controller.abort(); return job; });
    await expect(runComfyTemplate(template("image_z_image_turbo"), "key", { prompt: "p", signal: controller.signal })).rejects.toThrow();
    expect(sdk.cancel).toHaveBeenCalledOnce();
    expect(sdk.wait).not.toHaveBeenCalled();
  });

  it("rejects missing outputs and does not resubmit a failed job", async () => {
    completedJob("image");
    sdk.getOutputs.mockReturnValue([]);
    await expect(runComfyTemplate(template("image_z_image_turbo"), "key", { prompt: "p" })).rejects.toThrow("without the template's");
    expect(sdk.submit).toHaveBeenCalledOnce();
  });

  it("keeps music templates out of the speech model catalog", async () => {
    const provider = new ComfyCloudProvider({});
    const models = await provider.getAvailableTTSModels();
    expect(models.some((m) => m.id.startsWith("comfyui-template/"))).toBe(false);
    await expect(runComfyTemplate(template("audio_yue2_text2music"), "key", { prompt: "p" })).rejects.toThrow("speech provider");
  });
});

describe("Comfy template job errors", () => {
  it("names the template and job and adds the API key hint", async () => {
    completedJob("image");
    sdk.submit.mockResolvedValue({ id: "job-1", status: "failed", error: { message: "Invalid credentials" }, wait: sdk.wait, cancel: sdk.cancel, getOutputs: sdk.getOutputs });
    const selected = template("image_z_image_turbo");
    const error = await runComfyTemplate(selected, "key", { prompt: "p" }).catch((caught: unknown) => caught);
    expect((error as Error).message).toBe(`Comfy ${selected.name} job job-1 failed: Invalid credentials. A step inside this Comfy graph calls a hosted model and needs your Comfy API key.`);
    expect((error as Error).cause).toBeInstanceOf(Error);
    expect(sdk.submit).toHaveBeenCalledOnce();
  });

  it("omits the job id when submission fails", async () => {
    completedJob("image");
    const original = new Error("HTTP 503");
    sdk.submit.mockRejectedValue(original);
    const selected = template("image_z_image_turbo");
    const error = await runComfyTemplate(selected, "key", { prompt: "p" }).catch((caught: unknown) => caught);
    expect((error as Error).message).toBe(`Comfy ${selected.name} failed: HTTP 503`);
    expect((error as Error).cause).toBe(original);
  });
});
