import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  StableDiffusionCppProvider,
  imageDimensions,
  outputSize
} from "../../src/providers/sdcpp-provider.js";
import { resolveHubFile } from "../../src/providers/hf-hub-file.js";
import { SD_CPP_MODELS, sdCppModel } from "../../src/providers/sdcpp-models.js";
import { stopSdServer } from "../../src/providers/sdcpp-server.js";
import { SD_CPP_RELEASE_TAG } from "@nodetool-ai/config";

const FAKE_SERVER = fileURLToPath(new URL("./fixtures/fake-sd-server.mjs", import.meta.url));
const turbo = sdCppModel("sd-turbo")!;
const flux = sdCppModel("flux.1-schnell")!;

let root: string;
const saved: Record<string, string | undefined> = {};

/** Place a model's files in a fake HF hub cache under one snapshot. */
async function cacheModel(repoId: string, files: string[]): Promise<void> {
  const repo = join(root, "hub", `models--${repoId.replace("/", "--")}`);
  await mkdir(join(repo, "refs"), { recursive: true });
  await writeFile(join(repo, "refs", "main"), "abc\n");
  await mkdir(join(repo, "snapshots", "abc"), { recursive: true });
  for (const file of files) {
    await writeFile(join(repo, "snapshots", "abc", file), "weights");
  }
}

async function logEntries(): Promise<Array<{ argv?: string[]; request?: Record<string, unknown> }>> {
  const text = await readFile(join(root, "sd.log"), "utf8").catch(() => "");
  return text.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "sdcpp-provider-"));
  for (const key of ["HF_HUB_CACHE", "FAKE_SD_LOG", "SD_CPP_SERVER_PATH", "NODETOOL_HOST", "XDG_DATA_HOME"]) {
    saved[key] = process.env[key];
  }
  process.env.HF_HUB_CACHE = join(root, "hub");
  process.env.FAKE_SD_LOG = join(root, "sd.log");
  delete process.env.SD_CPP_SERVER_PATH;
  process.env.NODETOOL_HOST = "cli";
  process.env.XDG_DATA_HOME = join(root, "data");
});

afterAll(async () => {
  await stopSdServer();
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await rm(root, { recursive: true, force: true });
});

describe("stable-diffusion.cpp sizing", () => {
  it("uses the trained size when nothing is requested", () => {
    expect(outputSize(turbo)).toEqual({ width: 512, height: 512 });
    expect(outputSize(flux)).toEqual({ width: 1024, height: 1024 });
  });

  it("keeps an explicit size on the 64-pixel grid", () => {
    expect(outputSize(turbo, 1000, 700)).toEqual({ width: 1024, height: 704 });
  });

  it("derives a size from an aspect ratio at the trained area", () => {
    const size = outputSize(flux, null, null, "16:9");
    expect(size.width / size.height).toBeCloseTo(16 / 9, 1);
    expect(size.width * size.height).toBeLessThan(1024 * 1024 * 1.1);
  });

  it("scales a large source image down to the model's area", () => {
    expect(outputSize(turbo, 4000, 3000, null, true)).toEqual({ width: 704, height: 512 });
  });

  it("reads PNG and JPEG dimensions", () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47]);
    new DataView(png.buffer).setUint32(16, 640);
    new DataView(png.buffer).setUint32(20, 480);
    expect(imageDimensions(png)).toEqual({ width: 640, height: 480 });
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0, 0]);
    expect(imageDimensions(jpeg)).toEqual({ width: 640, height: 480 });
    expect(imageDimensions(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe("StableDiffusionCppProvider", () => {
  it("declares text-to-image and image-to-image", () => {
    expect(new StableDiffusionCppProvider().getCapabilities()).toEqual(
      expect.arrayContaining(["text_to_image", "image_to_image"])
    );
  });

  it("lists every model with its download, and reports a missing sd-server", async () => {
    const provider = new StableDiffusionCppProvider({ SD_CPP_SERVER_PATH: join(root, "absent") });
    const path = process.env.PATH;
    process.env.PATH = "";
    const models = await provider.getAvailableImageModels().finally(() => {
      process.env.PATH = path;
    });
    expect(models.map((m) => m.id)).toEqual(SD_CPP_MODELS.map((m) => m.id));
    const fluxModel = models.find((m) => m.id === "flux.1-schnell")!;
    expect(fluxModel.supportedTasks).toEqual(["text_to_image", "image_to_image"]);
    expect(fluxModel.adapter?.artifactRef).toEqual({
      source: "huggingface",
      repoId: "second-state/FLUX.1-schnell-GGUF",
      allowPatterns: ["flux1-schnell-Q4_0.gguf", "ae.safetensors", "clip_l-Q8_0.gguf", "t5xxl-Q4_0.gguf"]
    });
    expect(fluxModel.adapter?.state).toBe("missing_dependency");
    expect(fluxModel.adapter?.reason).toMatch(/runtime add sd-cpp/);
    expect(fluxModel.adapter?.filesPresent).toBe(false);

    // Shared encoders and VAEs come from their own repositories.
    const zImage = models.find((m) => m.id === "z-image-turbo")!;
    expect(zImage.adapter?.artifactRef?.repoId).toBe("leejet/Z-Image-Turbo-GGUF");
    expect(zImage.adapter?.extraArtifactRefs).toEqual([
      { source: "huggingface", repoId: "second-state/FLUX.1-schnell-GGUF", allowPatterns: ["ae.safetensors"] },
      {
        source: "huggingface",
        repoId: "unsloth/Qwen3-4B-Instruct-2507-GGUF",
        allowPatterns: ["Qwen3-4B-Instruct-2507-Q4_K_M.gguf"]
      }
    ]);
    expect(models.find((m) => m.id === "qwen-image-edit-2511")!.supportedTasks).toEqual(["image_to_image"]);
    expect(models.find((m) => m.id === "z-image-l2p")!.supportedTasks).toEqual(["text_to_image"]);
  });

  it("refuses a task the model does not serve", async () => {
    const provider = new StableDiffusionCppProvider({ SD_CPP_SERVER_PATH: FAKE_SERVER });
    const ref = (id: string) => ({ id, name: id, provider: "stable_diffusion_cpp" });
    await expect(provider.textToImage({ model: ref("qwen-image-edit-2511"), prompt: "x" })).rejects.toThrow(
      /image-to-image/
    );
    await expect(
      provider.imageToImage([new Uint8Array([1])], { model: ref("z-image-l2p"), prompt: "x" })
    ).rejects.toThrow(/text-to-image/);
  });

  it("names the missing files of a partly downloaded model", async () => {
    await cacheModel("second-state/FLUX.1-schnell-GGUF", ["ae.safetensors"]);
    const provider = new StableDiffusionCppProvider({ SD_CPP_SERVER_PATH: FAKE_SERVER });
    await expect(
      provider.textToImage({ model: { id: flux.id, name: flux.name, provider: "stable_diffusion_cpp" }, prompt: "x" })
    ).rejects.toThrow(
      /Missing: second-state\/FLUX\.1-schnell-GGUF\/flux1-schnell-Q4_0\.gguf, second-state\/FLUX\.1-schnell-GGUF\/clip_l-Q8_0\.gguf, second-state\/FLUX\.1-schnell-GGUF\/t5xxl-Q4_0\.gguf\./
    );
  });

  it.skipIf(process.platform === "win32")(
    "tells the user to update an sd-server older than the pinned release",
    async () => {
      // master-967 cannot read FLUX.3 weights and exits while it loads them.
      const dir = join(root, "old-sd-cpp");
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, "sd-server"),
        "#!/bin/sh\necho \"[E] get sd version from file failed: ''\" >&2\nexit 1\n"
      );
      await chmod(join(dir, "sd-server"), 0o755);
      await writeFile(join(dir, "nodetool-sd-cpp.json"), JSON.stringify({ tag: "master-967-e47426c" }));
      await cacheModel(turbo.files.model!.repoId, ["sd_turbo-f16-q8_0.gguf"]);
      const provider = new StableDiffusionCppProvider({ SD_CPP_SERVER_PATH: join(dir, "sd-server") });
      await expect(
        provider.textToImage({ model: { id: turbo.id, name: turbo.name, provider: "stable_diffusion_cpp" }, prompt: "x" })
      ).rejects.toThrow(
        new RegExp(
          `installed sd-server is master-967-e47426c.*needs ${SD_CPP_RELEASE_TAG}.*nodetool runtime add sd-cpp[\\s\\S]*get sd version from file failed`
        )
      );
    }
  );

  it("resolves cached files from the main snapshot", async () => {
    await cacheModel("acme/model", ["a.gguf"]);
    expect(await resolveHubFile("acme/model", "a.gguf")).toBe(
      join(root, "hub", "models--acme--model", "snapshots", "abc", "a.gguf")
    );
    expect(await resolveHubFile("acme/model", "b.gguf")).toBeNull();
  });

  it.skipIf(process.platform === "win32")(
    "starts sd-server with the model files, reuses it, and restarts it for another model",
    async () => {
      await cacheModel(turbo.files.model!.repoId, ["sd_turbo-f16-q8_0.gguf"]);
      const sd15 = sdCppModel("sd-1.5")!;
      await cacheModel(sd15.files.model!.repoId, ["stable-diffusion-v1-5-pruned-emaonly-Q8_0.gguf"]);
      const provider = new StableDiffusionCppProvider({ SD_CPP_SERVER_PATH: FAKE_SERVER });
      const ref = (id: string) => ({ id, name: id, provider: "stable_diffusion_cpp" });

      const image = await provider.textToImage({ model: ref("sd-turbo"), prompt: "a fox", seed: 3 });
      expect(imageDimensions(image)).toEqual({ width: 1, height: 1 });
      await provider.imageToImage([image], { model: ref("sd-turbo"), prompt: "a fox, watercolor", strength: 0.5 });
      await provider.textToImage({ model: ref("sd-1.5"), prompt: "a cat" });

      const entries = await logEntries();
      const argvs = entries.filter((e) => e.argv).map((e) => e.argv!);
      const launches = argvs.map((argv) => argv[1]);
      expect(launches).toHaveLength(2);
      expect(launches[0]).toMatch(/sd_turbo-f16-q8_0\.gguf$/);
      expect(launches[1]).toMatch(/stable-diffusion-v1-5-pruned-emaonly-Q8_0\.gguf$/);
      // Without flash attention a 1792x1024 SD-Turbo image asks Metal for 15.7 GB.
      expect(argvs[0]).toEqual(expect.arrayContaining(["--flash-attn", "on", "--vae-tiling"]));

      const requests = entries.filter((e) => e.request).map((e) => e.request!);
      expect(requests[0]).toMatchObject({
        prompt: "a fox",
        width: 512,
        height: 512,
        seed: 3,
        batch_count: 1,
        sample_params: { sample_steps: 4, guidance: { txt_cfg: 1 } }
      });
      expect(requests[1]).toMatchObject({ strength: 0.5, width: 64, height: 64 });
      expect(typeof requests[1]!.init_image).toBe("string");
      expect(requests[2]).toMatchObject({ sample_params: { sample_steps: 20, guidance: { txt_cfg: 7 } } });
    },
    30000
  );

  it.skipIf(process.platform === "win32")(
    "loads a model from several repositories and passes an edit source as a reference",
    async () => {
      await cacheModel("leejet/FLUX.2-klein-4B-GGUF", ["flux-2-klein-4b-Q4_0.gguf"]);
      await cacheModel("unsloth/Qwen3-4B-GGUF", ["Qwen3-4B-Q4_K_M.gguf"]);
      await mkdir(join(root, "hub", "models--Comfy-Org--flux2-dev", "snapshots", "abc", "split_files", "vae"), {
        recursive: true
      });
      await cacheModel("Comfy-Org/flux2-dev", ["split_files/vae/flux2-vae.safetensors"]);
      const provider = new StableDiffusionCppProvider({ SD_CPP_SERVER_PATH: FAKE_SERVER });
      const ref = { id: "flux.2-klein-4b", name: "klein", provider: "stable_diffusion_cpp" };
      const listed = (await provider.getAvailableImageModels()).find((m) => m.id === ref.id)!;
      expect(listed.adapter?.filesPresent).toBe(true);

      const source = await provider.textToImage({ model: ref, prompt: "a fox" });
      await provider.imageToImage([source], { model: ref, prompt: "make it blue" });

      const entries = await logEntries();
      const argv = entries.filter((e) => e.argv).at(-1)!.argv!;
      const flag = (name: string) => argv[argv.indexOf(name) + 1];
      expect(flag("--diffusion-model")).toMatch(/flux-2-klein-4b-Q4_0\.gguf$/);
      expect(flag("--llm")).toMatch(/Qwen3-4B-Q4_K_M\.gguf$/);
      expect(flag("--vae")).toMatch(/flux2-vae\.safetensors$/);
      const edit = entries.filter((e) => e.request).at(-1)!.request!;
      expect(edit.ref_images).toHaveLength(1);
      expect(edit).not.toHaveProperty("init_image");
      expect(edit).not.toHaveProperty("strength");
    },
    30000
  );
});

/** A safetensors file whose header names the given tensors, with no weights. */
async function writeSafetensors(file: string, tensors: string[]): Promise<void> {
  const header = Buffer.from(
    JSON.stringify(
      Object.fromEntries(tensors.map((name) => [name, { dtype: "F16", shape: [1], data_offsets: [0, 2] }]))
    )
  );
  const length = Buffer.alloc(8);
  length.writeBigUInt64LE(BigInt(header.length));
  await writeFile(file, Buffer.concat([length, header, Buffer.alloc(2)]));
}

describe("StableDiffusionCppProvider model folders", () => {
  it.skipIf(process.platform === "win32")(
    "lists single-file checkpoints from the folders and loads one with --model",
    async () => {
      const comfy = join(root, "ComfyUI", "models");
      await mkdir(join(comfy, "checkpoints", "xl"), { recursive: true });
      await mkdir(join(comfy, "loras"), { recursive: true });
      await mkdir(join(comfy, "diffusion_models"), { recursive: true });
      const sd15 = join(comfy, "checkpoints", "dreamshaper.safetensors");
      const sdxl = join(comfy, "checkpoints", "xl", "juggernaut.safetensors");
      await writeSafetensors(sd15, [
        "model.diffusion_model.input_blocks.0.0.weight",
        "first_stage_model.decoder.conv_in.weight",
        "cond_stage_model.transformer.text_model.embeddings.position_ids"
      ]);
      await writeSafetensors(sdxl, [
        "model.diffusion_model.input_blocks.0.0.weight",
        "first_stage_model.decoder.conv_in.weight",
        "conditioner.embedders.0.transformer.text_model.embeddings.position_ids",
        "conditioner.embedders.1.model.ln_final.weight"
      ]);
      // A LoRA and a diffusion model without encoders are not checkpoints.
      await writeSafetensors(join(comfy, "loras", "style.safetensors"), ["lora_unet_down_blocks_0.alpha"]);
      await writeSafetensors(join(comfy, "diffusion_models", "flux1-dev.safetensors"), [
        "double_blocks.0.img_attn.proj.weight"
      ]);

      const provider = new StableDiffusionCppProvider({ SD_CPP_SERVER_PATH: FAKE_SERVER, MODEL_FOLDERS: comfy });
      const models = await provider.getAvailableImageModels();
      const local = models.filter((m) => m.id.startsWith(comfy));
      expect(local.map((m) => m.id)).toEqual([sd15, sdxl]);
      expect(local[0]).toMatchObject({
        name: "dreamshaper (0 GB)",
        supportedTasks: ["text_to_image", "image_to_image"],
        adapter: { state: "installed", filesPresent: true }
      });
      expect(local[0]!.adapter?.artifactRef).toBeUndefined();

      await provider.textToImage({ model: { id: sdxl, name: "xl", provider: "stable_diffusion_cpp" }, prompt: "a fox" });
      const entries = await logEntries();
      const argv = entries.filter((e) => e.argv).at(-1)!.argv!;
      expect(argv.slice(0, 2)).toEqual(["--model", sdxl]);
      expect(entries.filter((e) => e.request).at(-1)!.request).toMatchObject({
        width: 1024,
        height: 1024,
        sample_params: { sample_steps: 25, guidance: { txt_cfg: 7 } }
      });

      await expect(
        provider.textToImage({
          model: { id: join(comfy, "loras", "style.safetensors"), name: "lora", provider: "stable_diffusion_cpp" },
          prompt: "x"
        })
      ).rejects.toThrow(/Unknown stable-diffusion.cpp model/);
    },
    30000
  );
});
