import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import { tagAsServer } from "@nodetool-ai/nodes-utils";
import {
  loadMediaRefBytes,
  withSpan,
  type MediaRefValue,
  type ProcessingContext
} from "@nodetool-ai/runtime";

const imageResult = z.object({
  output_format: z.enum(["png", "jpeg", "webp"]),
  images: z.array(z.object({ b64_json: z.string().min(1) })).min(1)
});
const jobSchema = z.object({
  status: z.enum(["queued", "generating", "completed", "failed", "cancelled"]),
  result: imageResult.nullish(),
  error: z.object({ message: z.string() }).nullish()
});

async function request<T>(
  url: URL,
  signal: AbortSignal,
  schema: z.ZodType<T>,
  body?: Record<string, unknown>
): Promise<T> {
  return withSpan(
    "sdcpp.http",
    { "http.request.method": body ? "POST" : "GET" },
    async () => {
      const options: RequestInit = {
        method: body ? "POST" : "GET",
        redirect: "error",
        signal
      };
      if (body) {
        options.headers = { "Content-Type": "application/json" };
        options.body = JSON.stringify(body);
      }
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(
          `stable-diffusion.cpp HTTP ${response.status}: ${(await response.text()).slice(0, 1000)}`
        );
      }
      return schema.parse(await response.json());
    }
  );
}

export class StableDiffusionCppGenerateNode extends BaseNode {
  static readonly nodeType = "lib.stable_diffusion_cpp.GenerateImage";
  static readonly title = "Generate Image (stable-diffusion.cpp)";
  static readonly description =
    "Generate images with a running stable-diffusion.cpp sd-server. Supports text-to-image, image-to-image, masks and reference images.\n    sdcpp, local, diffusion, gguf, image";
  static readonly autoSaveAsset = true;
  static readonly basicFields = ["endpoint", "prompt"];
  static readonly metadataOutputTypes = {
    output: "image",
    images: "list[image]"
  };

  @prop({
    type: "str",
    default: "http://127.0.0.1:1234",
    title: "Server URL",
    description: "Address of sd-server. The model is loaded by the server."
  })
  declare endpoint: string;
  @prop({ type: "str", default: "", title: "Prompt", required: true })
  declare prompt: string;
  @prop({ type: "str", default: "", title: "Negative Prompt" })
  declare negative_prompt: string;
  @prop({ type: "int", default: 512, min: 64, title: "Width" })
  declare width: number;
  @prop({ type: "int", default: 512, min: 64, title: "Height" })
  declare height: number;
  @prop({ type: "int", default: 20, min: 1, title: "Steps" })
  declare steps: number;
  @prop({ type: "float", default: 7, min: 0, title: "CFG Scale" })
  declare cfg_scale: number;
  @prop({
    type: "int",
    default: -1,
    min: -1,
    title: "Seed",
    description: "Use -1 for a random seed."
  })
  declare seed: number;
  @prop({ type: "int", default: 1, min: 1, title: "Image Count" })
  declare count: number;
  @prop({
    type: "str",
    default: "",
    title: "Sampler",
    description: "Native sample_method name. Empty uses the server default."
  })
  declare sampler: string;
  @prop({
    type: "str",
    default: "",
    title: "Scheduler",
    description: "Native scheduler name. Empty uses the server default."
  })
  declare scheduler: string;
  @prop({ type: "image", default: null, title: "Input Image" })
  declare image: MediaRefValue | null;
  @prop({
    type: "image",
    default: null,
    title: "Mask",
    description: "Optional mask for image-to-image generation."
  })
  declare mask: MediaRefValue | null;
  @prop({ type: "list[image]", default: [], title: "Reference Images" })
  declare reference_images: MediaRefValue[];
  @prop({ type: "float", default: 0.75, min: 0, max: 1, title: "Strength" })
  declare strength: number;
  @prop({
    type: "dict[str, any]",
    default: {},
    title: "Advanced Parameters",
    description:
      "Native img_gen fields such as lora, hires and vae_tiling_params. These override generation controls, including sample_params. Connected media takes precedence."
  })
  declare parameters: Record<string, unknown>;
  @prop({
    type: "int",
    default: 600,
    min: 1,
    title: "Timeout",
    description:
      "Maximum seconds for submission and generation. Requests cancellation on timeout; sd-server can cancel queued jobs but cannot interrupt active generation."
  })
  declare timeout: number;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const endpoint = new URL(this.endpoint);
    if (
      !["http:", "https:"].includes(endpoint.protocol) ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash
    ) {
      throw new Error(
        "Server URL must be HTTP or HTTPS without credentials, query or fragment"
      );
    }
    endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}/`;
    if (!this.prompt.trim()) {
      throw new Error("Prompt is required");
    }
    const timeout = z.number().int().positive().parse(this.timeout);
    const timeoutSignal = AbortSignal.timeout(timeout * 1000);
    const signal = context?.signal
      ? AbortSignal.any([context.signal, timeoutSignal])
      : timeoutSignal;
    signal.throwIfAborted();
    const sampleParams: Record<string, unknown> = {
      sample_steps: z.number().int().positive().parse(this.steps),
      guidance: { txt_cfg: z.number().nonnegative().parse(this.cfg_scale) }
    };
    if (this.sampler.trim()) {
      sampleParams.sample_method = this.sampler.trim();
    }
    if (this.scheduler.trim()) {
      sampleParams.scheduler = this.scheduler.trim();
    }
    const body: Record<string, unknown> = {
      prompt: this.prompt,
      negative_prompt: this.negative_prompt,
      width: z.number().int().min(64).parse(this.width),
      height: z.number().int().min(64).parse(this.height),
      seed: z.number().int().min(-1).parse(this.seed),
      batch_count: z.number().int().positive().parse(this.count),
      strength: z.number().min(0).max(1).parse(this.strength),
      sample_params: sampleParams,
      output_format: "png",
      ...z.record(z.string(), z.unknown()).parse(this.parameters)
    };
    for (const [field, media] of [
      ["init_image", this.image],
      ["mask_image", this.mask]
    ] as const) {
      if (media) {
        body[field] = await mediaBase64(media, context);
      }
    }
    if (this.reference_images.length > 0) {
      body.ref_images = await Promise.all(
        this.reference_images.map(async (media) => mediaBase64(media, context))
      );
    }
    let jobId: string | undefined;
    try {
      const submitted = await request(
        new URL("sdcpp/v1/img_gen", endpoint),
        signal,
        z.object({ id: z.string().min(1) }),
        body
      );
      jobId = submitted.id;
      const jobUrl = new URL(
        `sdcpp/v1/jobs/${encodeURIComponent(jobId)}`,
        endpoint
      );
      while (true) {
        const job = await request(jobUrl, signal, jobSchema);
        if (job.status === "completed") {
          const result = imageResult.parse(job.result);
          const images = result.images.map((image) => ({
            type: "image",
            uri: "",
            data: image.b64_json,
            mimeType: `image/${result.output_format}`
          }));
          return { output: images[0], images };
        }
        if (job.status === "failed" || job.status === "cancelled") {
          throw new Error(
            job.error?.message ?? `stable-diffusion.cpp job ${job.status}`
          );
        }
        await delay(500, undefined, { signal });
      }
    } catch (error) {
      if (signal.aborted && jobId) {
        try {
          await request(
            new URL(
              `sdcpp/v1/jobs/${encodeURIComponent(jobId)}/cancel`,
              endpoint
            ),
            AbortSignal.timeout(5000),
            jobSchema,
            {}
          );
        } catch (cancelError) {
          throw new AggregateError(
            [error, cancelError],
            "stable-diffusion.cpp generation stopped but job cancellation failed"
          );
        }
      }
      throw error;
    }
  }
}

export const STABLE_DIFFUSION_CPP_NODES = tagAsServer([
  StableDiffusionCppGenerateNode
]);

async function mediaBase64(
  media: MediaRefValue,
  context?: ProcessingContext
): Promise<string> {
  const bytes = await loadMediaRefBytes(media, context);
  if (!bytes?.length) {
    throw new Error("Could not load stable-diffusion.cpp input image");
  }
  return Buffer.from(bytes).toString("base64");
}
