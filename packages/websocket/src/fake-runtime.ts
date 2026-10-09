/**
 * Hermetic execution fakes shared by the test backends.
 *
 * Both test servers need workflows and chat to run with no API keys and no
 * network, while pure-compute nodes still run for real so the assertions mean
 * something:
 *   - `e2e-server.ts` runs the shipped templates for the web E2E runner.
 *   - `screenshot-server.ts` (with `NODETOOL_FAKE_PROVIDERS=1`) serves the
 *     seeded fixtures to the user-journey suite.
 *
 * Faking strategy:
 *   - LLM/agent providers: every registered provider id is re-registered with
 *     `FakeProvider` (a ScriptedProvider with no required credentials), so
 *     `getProvider` / `isProviderConfigured` and the runner's `resolveProvider`
 *     all return a configured fake regardless of how a node resolves its
 *     provider.
 *   - External / media-generating nodes (fal, replicate, search, http, image /
 *     video / audio generation, …) resolve to an executor returning
 *     type-correct placeholder outputs derived from the node's output metadata,
 *     so downstream and output nodes still receive well-formed values.
 *   - Structural nodes (input/output/control) and pure-compute nodes (text,
 *     data, math, …) run for real.
 *
 * Set `NODETOOL_FAKE_DEBUG=1` for per-node REAL/FAKE resolution logging.
 */

import { crc32, deflateSync } from "node:zlib";
import {
  ScriptedProvider,
  autoScript,
  registerProvider,
  listRegisteredProviderIds,
  sampleForSchema,
  isToolCall,
  getRegisteredProvider,
  type BaseProvider,
  type CredentialCheckResult,
  type ImageModel,
  type LanguageModel,
  type ProviderCapability,
  type ProviderStreamItem,
  type TextToImageParams
} from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { NodeExecutor } from "@nodetool-ai/kernel";
import { chunkSchema, type NodeDescriptor } from "@nodetool-ai/protocol";

/** Valid 1x1 transparent PNG — bytes for faked image/media outputs, so
 *  downstream nodes that decode them don't choke. */
export const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==";

/** Encode an RGB pixel buffer as a PNG with no image library. */
function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  const rows = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    rows[row] = 0; // filter: none
    rows.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), row + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

/**
 * A visible 256 × 256 gradient PNG for faked image outputs. A transparent 1 × 1
 * pixel renders as nothing, so a person looking at the result cannot tell a
 * finished generation from an empty one.
 */
function placeholderPng(): Buffer {
  const size = 256;
  const rgb = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 3;
      rgb[i] = x;
      rgb[i + 1] = y;
      rgb[i + 2] = 160;
    }
  }
  return encodePng(size, size, rgb);
}

/** Bytes every faked image output and fake `textToImage` call returns. */
export const FAKE_IMAGE_PNG_BASE64 = placeholderPng().toString("base64");

/** The text every faked LLM call returns. Assert on this in tests. */
export const FAKE_LLM_TEXT = "deterministic e2e response";

/** The value every faked non-media output slot returns. */
export const FAKE_OUTPUT_TEXT = "deterministic e2e output";

const FAKE_TRANSCRIPTION_TEXT = FAKE_LLM_TEXT;
type FakeTimestamp = [number, number];
const FAKE_TRANSCRIPTION_WORDS: Array<{
  text: string;
  timestamp: FakeTimestamp;
}> = [
  { text: "deterministic", timestamp: [0, 1] },
  { text: "e2e", timestamp: [1, 2] },
  { text: "response", timestamp: [2, 3] }
];
const FAKE_TRANSCRIPTION_SEGMENTS: Array<{
  text: string;
  timestamp: FakeTimestamp;
}> = [{ text: FAKE_TRANSCRIPTION_TEXT, timestamp: [0, 3] }];

const debugEnabled = (): boolean => process.env.NODETOOL_FAKE_DEBUG === "1";

function debug(message: string): void {
  if (!debugEnabled()) return;
  // eslint-disable-next-line no-console
  console.error(message);
}

// ── Provider faking ─────────────────────────────────────────────────────────

/**
 * Validate a `Chunk` a fake provider is about to yield against the B1
 * protocol schema (`packages/protocol/src/messages.ts`) and throw a
 * descriptive error on mismatch. Called unconditionally — this module only
 * ever runs in tests, so there is no production cost to always-on validation.
 * See RELIABILITY_ARCHITECTURE.md §8 point 5 ("Fakes derive from contracts").
 */
export function assertValidFakeChunk(chunk: unknown): void {
  const result = chunkSchema.safeParse(chunk);
  if (!result.success) {
    throw new Error(
      `[fake-runtime] FakeProvider emitted a Chunk that fails processingMessageSchemas.chunk: ${result.error.message}\n` +
        `Chunk: ${JSON.stringify(chunk)}`
    );
  }
}

/**
 * Models the fake runtime lists, by provider id. Without them every model
 * picker reads "No models available" and a person cannot start a chat or an
 * image generation. Two providers keep the pickers short.
 */
const FAKE_MODEL_CATALOG: Record<
  string,
  { language: string[]; image: string[] }
> = {
  openai: { language: ["Test Chat Model"], image: ["Test Image Model"] },
  anthropic: { language: ["Test Assistant Model"], image: [] }
};

const modelId = (name: string): string =>
  name.toLowerCase().replace(/\s+/g, "-");

/** A provider that returns deterministic scripted responses; ignores kwargs. */
export class FakeProvider extends ScriptedProvider {
  /** The provider id this fake stands in for. */
  readonly fakeProviderId: string;

  constructor(_kwargs?: Record<string, unknown>, providerId = "fake") {
    const inner = autoScript({
      plan: {
        title: "Agent task",
        steps: [
          { id: "s1", instructions: "Complete the objective", depends_on: [] }
        ]
      },
      text: FAKE_LLM_TEXT
    });
    super([
      (messages, tools) => {
        debug(
          `[fake-runtime] script tools=[${tools
            .map((t) => t.name)
            .join(",")}] roles=[${messages.map((m) => m.role).join(",")}]`
        );
        return inner(messages, tools);
      }
    ]);
    this.fakeProviderId = providerId;
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return (FAKE_MODEL_CATALOG[this.fakeProviderId]?.language ?? []).map(
      (name) => ({ id: modelId(name), name, provider: this.fakeProviderId })
    );
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return (FAKE_MODEL_CATALOG[this.fakeProviderId]?.image ?? []).map(
      (name) => ({
        id: modelId(name),
        name,
        provider: this.fakeProviderId,
        supportedTasks: ["text_to_image"]
      })
    );
  }

  /** Image pickers and the image step read this, not the model list. */
  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return (FAKE_MODEL_CATALOG[this.fakeProviderId]?.image.length ?? 0) > 0
      ? ["text_to_image"]
      : [];
  }

  override async textToImage(_params: TextToImageParams): Promise<Uint8Array> {
    return new Uint8Array(Buffer.from(FAKE_IMAGE_PNG_BASE64, "base64"));
  }

  /**
   * Validate every yielded `Chunk` (the only `ProcessingMessage`-shaped
   * payload a fake provider emits — tool calls and session updates carry no
   * `type: "chunk"` discriminator) against the B1 schema before it reaches
   * downstream consumers.
   */
  override async *generateMessages(
    args: Parameters<ScriptedProvider["generateMessages"]>[0] & {
      toolChoice?: string;
    }
  ): AsyncGenerator<ProviderStreamItem> {
    // A caller that forces one tool wants structured output (`generate_text`
    // with a schema, the image flow's brief). Answer with a call whose
    // arguments satisfy that tool's schema, as a real model must.
    const forced = (args.tools ?? []).find(
      (t) => t.name === args.toolChoice && t.inputSchema
    );
    if (forced) {
      yield {
        id: `fake-${forced.name}`,
        name: forced.name,
        args: sampleForSchema(forced.inputSchema) as Record<string, unknown>
      };
      return;
    }
    for await (const item of super.generateMessages(args)) {
      if (!isToolCall(item) && item.type === "chunk") {
        assertValidFakeChunk(item);
      }
      yield item;
    }
  }
}

/**
 * Replace every registered provider (openai, anthropic, gemini, …) with the
 * FakeProvider, keeping its display name and access kind so settings and
 * pickers show "OpenAI" rather than the bare id.
 *
 * By default each fake is registered with no required credentials. That makes
 * `isProviderConfigured` return true and `getProvider` return a fake on every
 * resolution path, so agent/LLM nodes never demand a real API key. With
 * `requireCredentials`, a fake keeps the provider's credential keys, so it
 * counts as configured only once a key is stored, as for a new user who
 * connects a provider in onboarding.
 *
 * Call again after node registration: providers self-register on import, so a
 * package loaded during registry setup can add a real provider afterwards.
 */
export function fakeAllProviders({
  requireCredentials = false
}: { requireCredentials?: boolean } = {}): void {
  for (const id of listRegisteredProviderIds()) {
    const registration = getRegisteredProvider(id);
    if (registration?.cls.prototype instanceof FakeProvider) continue;
    class FakeForProvider extends FakeProvider {
      constructor(kwargs?: Record<string, unknown>) {
        super(kwargs, id);
      }
    }
    registerProvider(
      id,
      FakeForProvider,
      requireCredentials ? (registration?.kwargs ?? {}) : {},
      requireCredentials ? (registration?.optionalKwargs ?? {}) : {},
      registration?.metadata ?? {}
    );
  }
}

/** A credential check that accepts every key without a network request. */
export async function acceptCredential(
  secretKey: string
): Promise<CredentialCheckResult> {
  return {
    status: "valid",
    message: `${secretKey} accepted. This test copy does not contact the provider.`
  };
}

/** A `resolveProvider` implementation that always hands back a fake. */
export const resolveFakeProvider = async (): Promise<BaseProvider> =>
  new FakeProvider();

// ── Executor faking ─────────────────────────────────────────────────────────

const MEDIA_TYPES = new Set(["image", "audio", "video", "document"]);

/** Node namespaces that reach external services (network / API keys) and must
 *  be faked. Matched as a prefix of the node type. */
const EXTERNAL_PREFIXES = [
  "fal.",
  "replicate.",
  "elevenlabs.",
  "huggingface.",
  "kie.",
  "openai.",
  "google.",
  "search.",
  "vector.chroma",
  "lib.http",
  "lib.pymupdf",
  "lib.sqlite",
  "lib.browser",
  "nodetool.generators.web"
];

/** Provider-backed node classes that don't produce media outputs (so the
 *  media-output heuristic misses them) but still need a real model/provider —
 *  faked by class name (last segment of the node type). */
const FAKE_NODE_CLASSES = new Set(["AutomaticSpeechRecognition"]);

/** Structural nodes must always run for real: inputs dispatch run params,
 *  outputs emit results, control routes the graph. */
const STRUCTURAL_PREFIXES = [
  "nodetool.input.",
  "nodetool.output.",
  "nodetool.control."
];

interface FakeMeta {
  node_type?: string;
  required_settings?: string[] | null;
  required_runtimes?: string[] | null;
  outputs?: Array<{ name: string; type?: { type?: string } }> | null;
  properties?: Array<{ name: string; type?: { type?: string } }> | null;
}

const baseType = (slot: { type?: { type?: string } } | undefined): string =>
  slot?.type?.type ?? "any";

const isStructural = (nodeType: string): boolean =>
  STRUCTURAL_PREFIXES.some((p) => nodeType.startsWith(p));

const isExternal = (nodeType: string): boolean =>
  EXTERNAL_PREFIXES.some((p) => nodeType.startsWith(p));

const isFakeByClass = (nodeType: string): boolean =>
  FAKE_NODE_CLASSES.has(nodeType.split(".").pop() ?? "");

const outputsMedia = (meta: FakeMeta | undefined): boolean =>
  (meta?.outputs ?? []).some((o) => MEDIA_TYPES.has(baseType(o)));

const inputsMedia = (meta: FakeMeta | undefined): boolean =>
  (meta?.properties ?? []).some((p) => MEDIA_TYPES.has(baseType(p)));

const needsSecret = (meta: FakeMeta | undefined): boolean =>
  Array.isArray(meta?.required_settings) && meta.required_settings.length > 0;

/** Nodes that shell out to external runtimes (ffmpeg/ffprobe, …) cannot run on
 *  the CI box regardless of their declared IO types — e.g. `timeline.AddClips`
 *  probes media bytes but is timeline-typed on both sides. */
const needsRuntime = (meta: FakeMeta | undefined): boolean =>
  Array.isArray(meta?.required_runtimes) && meta.required_runtimes.length > 0;

/** A placeholder value standing in for one output slot. */
export type FakeSlotValue =
  | string
  | number
  | boolean
  | null
  | never[]
  | Record<string, never>
  | { type: string; uri: string; data: string; mimeType: string };

/** Build a type-correct placeholder for a single output slot. */
export function fakeValueForType(type: string): FakeSlotValue {
  if (MEDIA_TYPES.has(type)) {
    const mime =
      type === "image"
        ? "image/png"
        : type === "audio"
          ? "audio/mpeg"
          : type === "video"
            ? "video/mp4"
            : "application/octet-stream";
    const data = type === "image" ? FAKE_IMAGE_PNG_BASE64 : TINY_PNG_BASE64;
    return {
      type,
      uri: `data:${mime};base64,${data}`,
      data,
      mimeType: mime
    };
  }
  switch (type) {
    case "str":
    case "text":
      return FAKE_OUTPUT_TEXT;
    case "int":
    case "float":
      return 0;
    case "bool":
      return true;
    case "list":
      return [];
    case "dict":
      return {};
    default:
      return null;
  }
}

/** An executor that emits placeholder outputs for a node's declared slots. */
export function fakeExecutor(
  meta: FakeMeta | undefined,
  nodeType?: string,
  staticProperties: Record<string, unknown> = {}
): NodeExecutor {
  return {
    async process(
      inputs: Record<string, unknown>
    ): Promise<Record<string, unknown>> {
      const outputs = meta?.outputs ?? [];
      if (outputs.length === 0) return inputs;
      const result: Record<string, unknown> = {};
      const effectiveNodeType = nodeType ?? meta?.node_type;
      const transcribeWithTimestamps =
        effectiveNodeType === "openai.audio.Transcribe" &&
        { ...staticProperties, ...inputs }.timestamps === true;
      for (const slot of outputs) {
        if (effectiveNodeType === "openai.audio.Transcribe") {
          if (slot.name === "text") {
            result[slot.name] = FAKE_TRANSCRIPTION_TEXT;
            continue;
          }
          if (transcribeWithTimestamps && slot.name === "words") {
            result[slot.name] = FAKE_TRANSCRIPTION_WORDS;
            continue;
          }
          if (transcribeWithTimestamps && slot.name === "segments") {
            result[slot.name] = FAKE_TRANSCRIPTION_SEGMENTS;
            continue;
          }
        }
        result[slot.name] = fakeValueForType(baseType(slot));
      }
      return result;
    }
  };
}

/** True when a node type should be faked rather than executed for real. */
export function shouldFakeNode(
  nodeType: string,
  meta: FakeMeta | undefined
): boolean {
  if (isStructural(nodeType)) return false;
  return (
    needsSecret(meta) ||
    needsRuntime(meta) ||
    outputsMedia(meta) ||
    inputsMedia(meta) ||
    isExternal(nodeType) ||
    isFakeByClass(nodeType)
  );
}

/**
 * Build a `resolveExecutor` that fakes external/provider-backed nodes and runs
 * everything else for real.
 *
 * `getRegistry` is a callback rather than a value because the registry only
 * exists once `createTestUiServer` calls `configureRegistry`, which happens
 * after the options object is constructed.
 *
 * @param getRegistry     returns the live registry, or null before setup
 * @param passthrough     when true, unknown node types echo their inputs
 *                        through instead of throwing (e.g. `test.Input`)
 */
export function createFakeExecutorResolver(
  getRegistry: () => NodeRegistry | null,
  { passthrough = true }: { passthrough?: boolean } = {}
): (node: NodeDescriptor) => NodeExecutor {
  const echo = {
    async process(inputs: Record<string, unknown>) {
      return inputs;
    }
  };

  return (node) => {
    const registry = getRegistry();
    if (!registry || !registry.has(node.type)) {
      if (!passthrough && registry) return registry.resolve(node);
      return echo;
    }
    if (isStructural(node.type)) return registry.resolve(node);

    const meta = registry.getMetadata(node.type);
    const fake = shouldFakeNode(node.type, meta);
    debug(`[fake-runtime] ${node.id} ${node.type} -> ${fake ? "FAKE" : "REAL"}`);
    if (fake) {
      return fakeExecutor(meta, node.type, node.properties ?? {});
    }

    // Templates leave model selection to the user. The hermetic host supplies
    // that selection so provider-backed nodes can run their real logic.
    const selectModels = (values: Record<string, unknown>): Record<string, unknown> => {
      const properties = { ...values };
      for (const property of meta?.properties ?? []) {
        if (baseType(property) !== "language_model") {
          continue;
        }
        const model = properties[property.name] ?? node.properties?.[property.name];
        properties[property.name] =
          typeof model === "object" && model !== null &&
          "id" in model && model.id && "provider" in model && model.provider
            ? model
            : {
                type: "language_model",
                provider: "openai",
                id: "fake-model",
                name: "E2E model"
              };
      }
      return properties;
    };
    const executor = registry.resolve({
      ...node,
      properties: selectModels(node.properties ?? {})
    });
    // The actor supplies saved properties as inputs, including empty models.
    // Apply the host selection again before BaseNode.assign() sees them.
    const resolved: NodeExecutor = {
      ...executor,
      process: (inputs, context) => executor.process(selectModels(inputs), context)
    };
    const genProcess = executor.genProcess;
    if (genProcess) {
      resolved.genProcess = (inputs, context) => genProcess(selectModels(inputs), context);
    }
    return resolved;
  };
}
