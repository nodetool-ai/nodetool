/**
 * Local image generation with stable-diffusion.cpp.
 *
 * The provider starts the `sd-server` binary from the `sd-cpp` runtime
 * package with the files of the model a generation asks for, then talks to
 * it over its `/sdcpp/v1` job API. Model files come from the Hugging Face
 * cache, where the model picker downloads them.
 */
import { z } from "zod";
import {
  SD_CPP_RELEASE_TAG,
  importNodeBuiltin,
  runtimeLocations,
  sdCppInstallStatus,
  sdServerPath
} from "@nodetool-ai/config";
import { missingRuntimePackageError } from "@nodetool-ai/protocol";
import { BaseProvider, type ProviderCapability } from "./base-provider.js";
import type {
  ImageModel,
  ImageToImageParams,
  Message,
  ModelAdapterInfo,
  ProviderStreamItem,
  TextToImageParams
} from "./types.js";
import {
  SD_CPP_COMPONENT_FLAGS,
  SD_CPP_MODELS,
  sdCppModel,
  sdCppModelRepos,
  sdCppModelTasks,
  type SdCppComponent,
  type SdCppFile,
  type SdCppModelSpec
} from "./sdcpp-models.js";
import { withSdServer } from "./sdcpp-server.js";
import { resolveHubFile } from "./hf-hub-file.js";

export const SD_CPP_PROVIDER_ID = "stable_diffusion_cpp";

const imageResult = z.object({
  output_format: z.string(),
  images: z.array(z.object({ b64_json: z.string().min(1) })).min(1)
});
const jobSchema = z.object({
  status: z.enum(["queued", "generating", "completed", "failed", "cancelled"]),
  result: imageResult.nullish(),
  error: z.object({ message: z.string() }).nullish()
});

const INSTALL_HINT =
  "Install stable-diffusion.cpp in Settings › Packages, or run `nodetool runtime add sd-cpp`.";

export class StableDiffusionCppProvider extends BaseProvider {
  static requiredSecrets(): string[] {
    return [];
  }

  private readonly serverPath?: string;

  constructor(secrets: { SD_CPP_SERVER_PATH?: string } = {}) {
    super(SD_CPP_PROVIDER_ID);
    this.serverPath =
      secrets.SD_CPP_SERVER_PATH?.trim() ||
      process.env.SD_CPP_SERVER_PATH?.trim() ||
      undefined;
  }

  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return ["text_to_image", "image_to_image"];
  }

  async generateMessage(
    _args: Parameters<BaseProvider["generateMessage"]>[0]
  ): Promise<Message> {
    throw new Error("stable-diffusion.cpp does not support chat generation");
  }

  // eslint-disable-next-line require-yield
  async *generateMessages(
    _args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    throw new Error("stable-diffusion.cpp does not support chat generation");
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    const binary = await this.findServer();
    return Promise.all(
      SD_CPP_MODELS.map(async (model) => ({
        id: model.id,
        name: `${model.name} (${model.sizeGb} GB)`,
        provider: SD_CPP_PROVIDER_ID,
        supportedTasks: sdCppModelTasks(model),
        adapter: adapterFor(model, binary !== null, (await missingFiles(model)).length === 0)
      }))
    );
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    const model = this.spec(params.model.id);
    if (model.textToImage === false) {
      throw new Error(`${model.name} edits a source image. Use it for image-to-image.`);
    }
    const size = outputSize(model, params.width, params.height, params.aspectRatio);
    return this.generate(model, params.signal, {
      prompt: params.prompt,
      negative_prompt: params.negativePrompt ?? "",
      width: size.width,
      height: size.height,
      seed: params.seed ?? -1,
      sample_params: sampleParams(model, params)
    });
  }

  override async imageToImage(
    images: Uint8Array[],
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    const source = images[0];
    if (!source?.length) {
      throw new Error("stable-diffusion.cpp image-to-image needs a source image");
    }
    const model = this.spec(params.model.id);
    if (!model.imageInput) {
      throw new Error(`${model.name} generates from text only. Use it for text-to-image.`);
    }
    const explicit = Boolean(params.targetWidth && params.targetHeight);
    const sourceSize = explicit ? null : scaledSource(model, imageDimensions(source));
    const size = outputSize(
      model,
      params.targetWidth ?? sourceSize?.width,
      params.targetHeight ?? sourceSize?.height,
      params.aspectRatio,
      !explicit && !model.sourceScale
    );
    const encoded = Buffer.from(source).toString("base64");
    // An edit model reads the source as a reference. Other models denoise
    // from it, by `strength`.
    const imageFields =
      model.imageInput === "reference"
        ? { ref_images: [encoded] }
        : { init_image: encoded, strength: params.strength ?? 0.75 };
    return this.generate(model, params.signal, {
      prompt: params.prompt,
      negative_prompt: params.negativePrompt ?? "",
      width: size.width,
      height: size.height,
      seed: params.seed ?? -1,
      ...imageFields,
      sample_params: sampleParams(model, params)
    });
  }

  private spec(id: string): SdCppModelSpec {
    const model = sdCppModel(id);
    if (!model) {
      throw new Error(
        `Unknown stable-diffusion.cpp model "${id}". Known: ${SD_CPP_MODELS.map((m) => m.id).join(", ")}.`
      );
    }
    return model;
  }

  private async generate(
    model: SdCppModelSpec,
    signal: AbortSignal | undefined,
    body: Record<string, unknown>
  ): Promise<Uint8Array> {
    const binary = await this.findServer();
    if (!binary) {
      throw missingRuntimePackageError("sd-server", "sd-cpp");
    }
    const args = await modelArgs(model);
    try {
      return await withSdServer({ binary, args }, signal, async (baseUrl) => {
        const result = await runJob(baseUrl, { ...body, batch_count: 1, output_format: "png" }, signal);
        return new Uint8Array(Buffer.from(result.images[0]!.b64_json, "base64"));
      });
    } catch (error) {
      throw await withUpdateHint(binary, error);
    }
  }

  /**
   * The `sd-server` to run: the configured path, the desktop or CLI install,
   * then PATH. Null when none exists.
   */
  private async findServer(): Promise<string | null> {
    const fs = await importNodeBuiltin<typeof import("node:fs/promises")>("node:fs/promises");
    const path = await importNodeBuiltin<typeof import("node:path")>("node:path");
    if (!fs || !path) {
      return null;
    }
    const platform = process.platform;
    const candidates: string[] = [];
    if (this.serverPath) {
      candidates.push(this.serverPath);
    }
    const installs = [runtimeLocations().sdCpp];
    try {
      installs.push(runtimeLocations({ ...process.env, NODETOOL_HOST: "cli" }).sdCpp);
    } catch {
      // Only the configured locations apply.
    }
    for (const dir of installs) {
      if (dir) {
        candidates.push(sdServerPath(dir, platform));
      }
    }
    const exe = platform === "win32" ? "sd-server.exe" : "sd-server";
    for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
      if (dir) {
        candidates.push(path.join(dir, exe));
      }
    }
    for (const candidate of candidates) {
      try {
        await fs.access(candidate, fs.constants.X_OK);
        return candidate;
      } catch {
        // Try the next location.
      }
    }
    return null;
  }
}

/**
 * Prefix a failure with an update hint when the sd-server install is older
 * than the pinned release: an old server cannot read newer model formats and
 * reports only that it failed to load the file.
 */
async function withUpdateHint(binary: string, error: unknown): Promise<unknown> {
  if (!(error instanceof Error) || error.name === "AbortError") {
    return error;
  }
  const path = await importNodeBuiltin<typeof import("node:path")>("node:path");
  if (!path) {
    return error;
  }
  const { version } = await sdCppInstallStatus(path.dirname(binary), process.platform);
  if (!version || version === SD_CPP_RELEASE_TAG) {
    return error;
  }
  return new Error(
    `The installed sd-server is ${version}, and NodeTool needs ${SD_CPP_RELEASE_TAG}. ` +
      "Update stable-diffusion.cpp in Settings › Packages, or run `nodetool runtime add sd-cpp`.\n\n" +
      error.message,
    { cause: error }
  );
}

function adapterFor(
  model: SdCppModelSpec,
  serverInstalled: boolean,
  filesPresent: boolean
): ModelAdapterInfo {
  const [main, ...extra] = sdCppModelRepos(model).map((repo) => ({
    source: "huggingface" as const,
    repoId: repo.repoId,
    allowPatterns: repo.paths
  }));
  const artifacts = { artifactRef: main, extraArtifactRefs: extra, filesPresent };
  if (!serverInstalled) {
    return {
      state: "missing_dependency",
      reasonCode: "runtime_package_missing",
      reason: `sd-server is not installed. ${INSTALL_HINT}`,
      ...artifacts
    };
  }
  return { state: "installed", ...artifacts };
}

/** The model files missing from the Hugging Face cache. */
async function missingFiles(model: SdCppModelSpec): Promise<SdCppFile[]> {
  const files = Object.values(model.files).filter((file): file is SdCppFile => Boolean(file));
  const present = await Promise.all(files.map((file) => resolveHubFile(file.repoId, file.path)));
  return files.filter((_, index) => !present[index]);
}

/** The sd-server flags that load each file of a model from the HF cache. */
async function modelArgs(model: SdCppModelSpec): Promise<string[]> {
  const args: string[] = [];
  const missing: string[] = [];
  for (const [component, file] of Object.entries(model.files) as [SdCppComponent, SdCppFile][]) {
    const resolved = await resolveHubFile(file.repoId, file.path);
    if (!resolved) {
      missing.push(`${file.repoId}/${file.path}`);
      continue;
    }
    args.push(SD_CPP_COMPONENT_FLAGS[component], resolved);
  }
  if (missing.length > 0) {
    throw new Error(
      `${model.name} is not fully downloaded. Missing: ${missing.join(", ")}. Download the model from the model picker.`
    );
  }
  // The default attention needs memory in the square of the pixel count: a
  // 1792x1024 SD-Turbo image asks Metal for 15.7 GB and fails. Flash
  // attention and a tiled VAE keep large sizes within reach.
  return [...args, ...(model.serverArgs ?? []), "--flash-attn", "on", "--vae-tiling"];
}

/** The source size an upscaler turns a source image into. */
function scaledSource(
  model: SdCppModelSpec,
  size: { width: number; height: number } | null
): { width: number; height: number } | null {
  if (!size || !model.sourceScale) {
    return size;
  }
  const { scale, maxSide } = model.sourceScale;
  const factor = Math.min(scale, maxSide / Math.max(size.width, size.height));
  return { width: size.width * factor, height: size.height * factor };
}

function sampleParams(
  model: SdCppModelSpec,
  params: { numInferenceSteps?: number | null; guidanceScale?: number | null; scheduler?: string | null }
): Record<string, unknown> {
  const sample: Record<string, unknown> = {
    sample_steps: params.numInferenceSteps ?? model.defaults.steps,
    guidance: { txt_cfg: params.guidanceScale ?? model.defaults.cfgScale }
  };
  if (model.defaults.sampler) {
    sample.sample_method = model.defaults.sampler;
  }
  if (model.defaults.flowShift !== undefined) {
    sample.flow_shift = model.defaults.flowShift;
  }
  if (params.scheduler) {
    sample.scheduler = params.scheduler;
  }
  return sample;
}

/** Round to the 64-pixel grid the diffusion models expect. */
function grid(value: number): number {
  return Math.max(64, Math.round(value / 64) * 64);
}

/**
 * The output size: the requested width and height, else the aspect ratio at
 * the model's trained area, else a square at the trained size. With `fit`
 * (a size read from a source image), a size above 1.5 times the trained area
 * scales down to it, keeping the aspect ratio.
 */
export function outputSize(
  model: SdCppModelSpec,
  width?: number | null,
  height?: number | null,
  aspectRatio?: string | null,
  fit = false
): { width: number; height: number } {
  const area = model.defaults.size * model.defaults.size;
  let w = width && width > 0 ? width : 0;
  let h = height && height > 0 ? height : 0;
  if (!w || !h) {
    const ratio = parseAspectRatio(aspectRatio) ?? 1;
    w = Math.sqrt(area * ratio);
    h = w / ratio;
  }
  const scale = fit ? Math.min(1, Math.sqrt((area * 1.5) / (w * h))) : 1;
  return { width: grid(w * scale), height: grid(h * scale) };
}

function parseAspectRatio(value?: string | null): number | null {
  const match = value?.match(/^(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)$/);
  if (!match) {
    return null;
  }
  const ratio = Number(match[1]) / Number(match[2]);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

/** Width and height from a PNG or JPEG header, or null for other formats. */
export function imageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        return null;
      }
      const marker = bytes[offset + 1]!;
      const length = view.getUint16(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
      }
      offset += 2 + length;
    }
  }
  return null;
}

async function requestJson<T>(
  url: string,
  schema: z.ZodType<T>,
  signal: AbortSignal | undefined,
  body?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "error",
    signal
  });
  if (!response.ok) {
    throw new Error(
      `stable-diffusion.cpp HTTP ${response.status}: ${(await response.text()).slice(0, 1000)}`
    );
  }
  return schema.parse(await response.json());
}

/** Submit one img_gen job and poll it to completion, cancelling on abort. */
async function runJob(
  baseUrl: string,
  body: Record<string, unknown>,
  signal: AbortSignal | undefined
): Promise<z.infer<typeof imageResult>> {
  const { id } = await requestJson(
    `${baseUrl}/sdcpp/v1/img_gen`,
    z.object({ id: z.string().min(1) }),
    signal,
    body
  );
  const jobUrl = `${baseUrl}/sdcpp/v1/jobs/${encodeURIComponent(id)}`;
  try {
    for (;;) {
      const job = await requestJson(jobUrl, jobSchema, signal);
      if (job.status === "completed") {
        return imageResult.parse(job.result);
      }
      if (job.status === "failed" || job.status === "cancelled") {
        throw new Error(job.error?.message ?? `stable-diffusion.cpp job ${job.status}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      signal?.throwIfAborted();
    }
  } catch (error) {
    if (signal?.aborted) {
      await fetch(`${jobUrl}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(5000)
      }).catch(() => undefined);
    }
    throw error;
  }
}
