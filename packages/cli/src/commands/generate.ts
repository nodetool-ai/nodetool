/**
 * `nodetool generate` — generate media from any provider, from the terminal.
 *
 *   nodetool generate fal-ai flux-schnell "a red fox in snow" -o fox.png
 *   nodetool generate openai gpt-image-1 "a logo" --aspect-ratio 1:1
 *   nodetool generate fal-ai --list-models            # discover model ids
 *
 * Built to be agent-friendly: positional `<provider> <model> <prompt>`, lenient
 * model/provider name matching, `--json` machine output, and a `--list-models`
 * discovery mode. Today it covers text-to-image (and image-to-image with
 * `--image`); the surface is shaped to grow to other modalities.
 *
 * Heavy deps (runtime providers, DB) load lazily inside the action.
 */
import type { Command } from "commander";
import type { ImageModel, TextToImageParams } from "@nodetool-ai/runtime";

interface GenerateCliOptions {
  output?: string;
  width?: string;
  height?: string;
  aspectRatio?: string;
  negativePrompt?: string;
  seed?: string;
  numImages?: string;
  steps?: string;
  guidance?: string;
  strength?: string;
  image?: string[];
  listModels?: boolean;
  json?: boolean;
}

/** Hyphen/space spellings agents are likely to type for an underscored id. */
const PROVIDER_ALIASES: Record<string, string> = {
  fal: "fal_ai",
  "fal-ai": "fal_ai",
  falai: "fal_ai",
  "eleven-labs": "elevenlabs",
  "claude-agent-sdk": "claude_agent_sdk",
  "llama-cpp": "llama_cpp"
};

const normKey = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function pickExtension(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0x89 && bytes[1] === 0x50) return "png";
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49) return "gif";
  if (
    bytes.length >= 12 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return "webp";
  return "png";
}

/** Resolve a user-typed provider name to a registered runtime provider id. */
function resolveProviderId(input: string, registered: string[]): string | null {
  const lower = input.toLowerCase();
  const underscore = lower.replace(/[-\s]+/g, "_");
  for (const candidate of [lower, underscore]) {
    if (registered.includes(candidate)) return candidate;
    if (PROVIDER_ALIASES[candidate] && registered.includes(PROVIDER_ALIASES[candidate]))
      return PROVIDER_ALIASES[candidate];
  }
  return null;
}

/** Match a loose model name ("flux-schnell") to a real image model. */
function resolveImageModel(
  models: ImageModel[],
  input: string,
  provider: string
): ImageModel {
  if (models.length === 0) {
    // No manifest available — trust the raw id (works for FAL endpoint ids).
    return { id: input, name: input, provider: provider as ImageModel["provider"] };
  }
  const want = normKey(input);
  const exact = models.find((m) => m.id === input);
  if (exact) return exact;
  const norm = models.find(
    (m) => normKey(m.id) === want || normKey(m.name) === want
  );
  if (norm) return norm;
  const suffix = models.find(
    (m) => m.id.endsWith(input) || normKey(m.id).endsWith(want)
  );
  if (suffix) return suffix;
  const partial = models.filter(
    (m) => normKey(m.id).includes(want) || normKey(m.name).includes(want)
  );
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    const list = partial.slice(0, 10).map((m) => `  ${m.id}`).join("\n");
    throw new Error(
      `Model "${input}" is ambiguous for ${provider}. Candidates:\n${list}\n` +
        `Pass a full model id.`
    );
  }
  if (input.includes("/")) {
    return { id: input, name: input, provider: provider as ImageModel["provider"] };
  }
  throw new Error(
    `Model "${input}" not found for ${provider}. ` +
      `Run \`nodetool generate ${provider} --list-models\` to see available ids.`
  );
}

/** Init the secret DB so encrypted keys resolve; env-only keys work regardless. */
async function initSecretStore(): Promise<void> {
  try {
    const { initDb } = await import("@nodetool-ai/models");
    const { initMasterKey } = await import("@nodetool-ai/security");
    const { getDefaultDbPath } = await import("@nodetool-ai/config");
    initDb(getDefaultDbPath());
    try {
      await initMasterKey();
    } catch {
      // Decryption is best-effort; env-var keys still resolve via the registry.
    }
  } catch {
    // No DB available — rely on process.env for the provider key.
  }
}

export function registerGenerateCommand(program: Command): void {
  program
    .command("generate [provider] [model] [prompt...]")
    .description(
      "Generate an image from any provider (e.g. `generate fal-ai flux-schnell \"a fox\"`)"
    )
    .option("-o, --output <path>", "Output file or directory")
    .option("--width <n>", "Image width in pixels")
    .option("--height <n>", "Image height in pixels")
    .option("--aspect-ratio <ratio>", "Aspect ratio, e.g. 16:9, 1:1, 9:16")
    .option("--negative-prompt <text>", "What to avoid in the image")
    .option("--seed <n>", "Random seed for reproducible output")
    .option("-n, --num-images <n>", "Number of images to generate", "1")
    .option("--steps <n>", "Inference steps")
    .option("--guidance <n>", "Guidance scale")
    .option("--strength <n>", "Image-to-image strength (with --image)")
    .option(
      "--image <path...>",
      "Input image(s) — switches to image-to-image"
    )
    .option("--list-models", "List the provider's image models and exit")
    .option("--json", "Print the result as JSON")
    .action(
      async (
        providerArg: string | undefined,
        modelArg: string | undefined,
        promptParts: string[] | undefined,
        opts: GenerateCliOptions
      ) => {
        try {
          await run(providerArg, modelArg, promptParts ?? [], opts);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (opts.json) {
            console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
          } else {
            console.error(`\n❌ ${msg}`);
          }
          process.exit(1);
        }
      }
    );
}

async function run(
  providerArg: string | undefined,
  modelArg: string | undefined,
  promptParts: string[],
  opts: GenerateCliOptions
): Promise<void> {
  if (!providerArg) {
    throw new Error(
      "Provider is required. Usage: nodetool generate <provider> <model> <prompt>"
    );
  }

  const { listRegisteredProviderIds } = await import("@nodetool-ai/runtime");
  const { createProvider, providerSecretKey } = await import("../providers.js");

  await initSecretStore();

  const registered = listRegisteredProviderIds();
  const providerId = resolveProviderId(providerArg, registered);
  if (!providerId) {
    throw new Error(
      `Unknown provider "${providerArg}". Image providers include: ` +
        `fal-ai, openai, gemini, replicate, kie. ` +
        `Registered ids: ${registered.join(", ")}`
    );
  }

  let provider;
  try {
    provider = await createProvider(providerId);
  } catch (e) {
    const key = providerSecretKey(providerId);
    const hint = key ? ` Set ${key} (env var or \`nodetool secrets store ${key}\`).` : "";
    throw new Error(
      `Could not initialize provider "${providerId}": ${e instanceof Error ? e.message : String(e)}.${hint}`
    );
  }

  const models = await provider.getAvailableImageModels().catch(() => [] as ImageModel[]);

  if (opts.listModels) {
    if (opts.json) {
      console.log(JSON.stringify({ provider: providerId, models }, null, 2));
    } else if (models.length === 0) {
      console.log(`No image models listed for ${providerId}.`);
    } else {
      console.log(`\nImage models for ${providerId} (${models.length}):\n`);
      for (const m of models) console.log(`  ${m.id}${m.name && m.name !== m.id ? `  — ${m.name}` : ""}`);
    }
    return;
  }

  if (!modelArg) throw new Error("Model is required. Run with --list-models to see options.");
  const prompt = promptParts.join(" ").trim();
  if (!prompt) throw new Error("Prompt is required.");

  const model = resolveImageModel(models, modelArg, providerId);
  const numImages = Math.max(1, parseInt(opts.numImages ?? "1", 10) || 1);

  const params: TextToImageParams = {
    model,
    prompt,
    negativePrompt: opts.negativePrompt ?? null,
    ...(opts.width ? { width: parseInt(opts.width, 10) } : {}),
    ...(opts.height ? { height: parseInt(opts.height, 10) } : {}),
    aspectRatio: opts.aspectRatio ?? null,
    ...(opts.seed ? { seed: parseInt(opts.seed, 10) } : {}),
    ...(opts.steps ? { numInferenceSteps: parseInt(opts.steps, 10) } : {}),
    ...(opts.guidance ? { guidanceScale: parseFloat(opts.guidance) } : {})
  };

  if (!opts.json) {
    console.error(
      `\nGenerating ${numImages > 1 ? `${numImages} images` : "image"} with ${providerId} / ${model.id} …`
    );
  }

  let images: Uint8Array[];
  if (opts.image && opts.image.length > 0) {
    const { readFile } = await import("node:fs/promises");
    const inputs = await Promise.all(
      opts.image.map(async (p) => new Uint8Array(await readFile(p)))
    );
    const i2iParams = {
      ...params,
      ...(opts.strength ? { strength: parseFloat(opts.strength) } : {})
    };
    images =
      numImages > 1
        ? await provider.imageToImages(inputs, i2iParams, numImages)
        : [await provider.imageToImage(inputs, i2iParams)];
  } else {
    images =
      numImages > 1
        ? await provider.textToImages(params, numImages)
        : [await provider.textToImage(params)];
  }

  const paths = await writeImages(images, model, opts.output);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          provider: providerId,
          model: model.id,
          prompt,
          images: paths.map((path, i) => ({ path, bytes: images[i].length }))
        },
        null,
        2
      )
    );
  } else {
    console.log(`\n✅ Wrote ${paths.length} image(s):`);
    for (const p of paths) console.log(`  ${p}`);
  }
}

/** Write image bytes to disk, returning absolute paths. */
async function writeImages(
  images: Uint8Array[],
  model: ImageModel,
  output: string | undefined
): Promise<string[]> {
  const { writeFile, mkdir, stat } = await import("node:fs/promises");
  const path = await import("node:path");

  const slug = normKey(model.id).slice(0, 32) || "image";
  const stamp = `${Date.now()}`;

  // Decide directory + base name from --output.
  let dir = process.cwd();
  let base: string | null = null;
  if (output) {
    const isDir =
      output.endsWith("/") ||
      output.endsWith(path.sep) ||
      (await stat(output).then((s) => s.isDirectory()).catch(() => false));
    if (isDir) {
      dir = output;
    } else {
      dir = path.dirname(output);
      base = path.basename(output).replace(/\.[^.]+$/, "");
    }
  }
  await mkdir(dir, { recursive: true });

  const paths: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const ext = pickExtension(images[i]);
    const suffix = images.length > 1 ? `-${i + 1}` : "";
    const name = base
      ? `${base}${suffix}.${ext}`
      : `nodetool-${slug}-${stamp}${suffix}.${ext}`;
    const full = path.resolve(dir, name);
    await writeFile(full, images[i]);
    paths.push(full);
  }
  return paths;
}
