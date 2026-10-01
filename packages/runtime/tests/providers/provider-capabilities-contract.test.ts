/**
 * Every registered provider's declared capabilities agree with what it can
 * run: each declared operation has an implementation of its own, and every
 * task its offline model catalog offers is declared.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getProvider,
  listRegisteredProviderIds
} from "../../src/providers/provider-registry.js";
// Import side effect: registers every built-in provider.
import "../../src/providers/index.js";
import {
  BaseProvider,
  type ProviderCapability
} from "../../src/providers/base-provider.js";

type OperationName = keyof BaseProvider & string;

/** The provider methods that implement each capability beyond chat. */
const CAPABILITY_OPERATIONS: Record<
  Exclude<ProviderCapability, "generate_message" | "generate_messages">,
  readonly OperationName[]
> = {
  text_to_image: ["textToImage"],
  image_to_image: ["imageToImage"],
  inpainting: ["inpaint"],
  outpaint_image: ["outpaintImage"],
  upscale_image: ["upscaleImage"],
  remove_background: ["removeBackground"],
  relight_image: ["relightImage"],
  segment_image: ["segmentImage"],
  vectorize_image: ["vectorizeImage"],
  text_to_video: ["textToVideo"],
  image_to_video: ["imageToVideo"],
  reference_to_video: ["referenceToVideo"],
  video_to_video: ["videoToVideo"],
  extend_video: ["extendVideo"],
  upscale_video: ["upscaleVideo"],
  interpolate_video: ["interpolateVideo"],
  outpaint_video: ["outpaintVideo"],
  lip_sync: ["lipSync"],
  text_to_speech: ["textToSpeech", "textToSpeechEncoded"],
  text_to_music: ["textToMusic"],
  audio_to_audio: ["audioToAudio"],
  video_to_audio: ["videoToAudio"],
  automatic_speech_recognition: ["automaticSpeechRecognition"],
  generate_embedding: ["generateEmbedding"],
  text_to_3d: ["textTo3D"],
  image_to_3d: ["imageTo3D"],
  list_generations: ["listGenerations"],
  get_generation: ["getGeneration"],
  track_object: ["trackObject"]
};

const KNOWN_CAPABILITIES = new Set<string>([
  "generate_message",
  "generate_messages",
  ...Object.keys(CAPABILITY_OPERATIONS)
]);

/**
 * Catalog tasks a provider lists models for but has no operation to run.
 * Each entry is a known gap, matched exactly, so closing one fails the test
 * until it is removed here.
 */
const CATALOG_GAPS: Record<string, readonly string[]> = {
  // Listed for model pickers, but neither operation is implemented.
  replicate: ["automatic_speech_recognition", "generate_embedding"],
  // Manifest models (recraft remove-background, motion-control and video
  // edit endpoints, volcengine lip sync) with no matching Kie operation.
  kie: ["remove_background", "video_to_video", "lip_sync"]
};

const dummySecret = async (key: string): Promise<string> =>
  `contract-test-${key}`;

/** Discovery that needs the network answers nothing, quickly. */
async function offline<T>(load: () => Promise<T[]>): Promise<T[]> {
  const timeout = new Promise<T[]>((resolve) => {
    setTimeout(() => resolve([]), 2000);
  });
  try {
    return await Promise.race([load(), timeout]);
  } catch {
    return [];
  }
}

function implementsOperation(
  provider: BaseProvider,
  operation: OperationName
): boolean {
  const own: unknown = Reflect.get(Object.getPrototypeOf(provider), operation);
  return own !== BaseProvider.prototype[operation];
}

/** Capabilities the provider's offline model catalog says it can run. */
async function catalogCapabilities(provider: BaseProvider): Promise<string[]> {
  const tasks = (models: { supportedTasks?: string[] }[]): string[] =>
    models.flatMap((model) => model.supportedTasks ?? []);
  const required: string[] = [];
  required.push(...tasks(await offline(() => provider.getAvailableImageModels())));
  required.push(...tasks(await offline(() => provider.getAvailableVideoModels())));
  required.push(...tasks(await offline(() => provider.getAvailable3DModels())));
  const categories: [() => Promise<unknown[]>, ProviderCapability][] = [
    [() => provider.getAvailableTTSModels(), "text_to_speech"],
    [() => provider.getAvailableASRModels(), "automatic_speech_recognition"],
    [() => provider.getAvailableMusicModels(), "text_to_music"],
    [() => provider.getAvailableAudioToAudioModels(), "audio_to_audio"],
    [() => provider.getAvailableEmbeddingModels(), "generate_embedding"]
  ];
  for (const [load, capability] of categories) {
    if ((await offline(load)).length > 0) required.push(capability);
  }
  return [...new Set(required)].filter((task) => KNOWN_CAPABILITIES.has(task));
}

describe("provider capability contract", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network disabled in the capability contract");
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const ids = listRegisteredProviderIds();

  it("enumerates the registry", () => {
    expect(ids.length).toBeGreaterThan(20);
  });

  it.each(ids)("%s implements every capability it declares", async (id) => {
    expect(vi.isMockFunction(globalThis.fetch)).toBe(true);
    const provider = await getProvider(id, dummySecret);
    const unimplemented = provider
      .getCapabilities()
      .filter((capability) => capability in CAPABILITY_OPERATIONS)
      .filter(
        (capability) =>
          !CAPABILITY_OPERATIONS[
            capability as keyof typeof CAPABILITY_OPERATIONS
          ].some((operation) => implementsOperation(provider, operation))
      );
    expect(unimplemented).toEqual([]);
  });

  it.each(ids)(
    "%s declares every task its model catalog offers",
    async (id) => {
      expect(vi.isMockFunction(globalThis.fetch)).toBe(true);
      const provider = await getProvider(id, dummySecret);
      const declared = new Set<string>(provider.getCapabilities());
      const undeclared = (await catalogCapabilities(provider)).filter(
        (task) => !declared.has(task)
      );
      expect(undeclared).toEqual(CATALOG_GAPS[id] ?? []);
    },
    30_000
  );
});
