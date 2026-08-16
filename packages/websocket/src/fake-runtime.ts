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

import {
  ScriptedProvider,
  autoScript,
  registerProvider,
  listRegisteredProviderIds,
  type BaseProvider,
  type ProviderStreamItem
} from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { NodeExecutor } from "@nodetool-ai/kernel";
import { chunkSchema } from "@nodetool-ai/protocol";

/** Valid 1x1 transparent PNG — bytes for faked image/media outputs, so
 *  downstream nodes that decode them don't choke. */
export const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==";

/** The text every faked LLM call returns. Assert on this in tests. */
export const FAKE_LLM_TEXT = "deterministic e2e response";

/** The value every faked non-media output slot returns. */
export const FAKE_OUTPUT_TEXT = "deterministic e2e output";

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

/** A provider that returns deterministic scripted responses; ignores kwargs. */
export class FakeProvider extends ScriptedProvider {
  constructor(_kwargs?: Record<string, unknown>) {
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
  }

  /**
   * Validate every yielded `Chunk` (the only `ProcessingMessage`-shaped
   * payload a fake provider emits — tool calls and session updates carry no
   * `type: "chunk"` discriminator) against the B1 schema before it reaches
   * downstream consumers.
   */
  override async *generateMessages(
    args: Parameters<ScriptedProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    for await (const item of super.generateMessages(args)) {
      if (typeof item === "object" && item !== null && "type" in item) {
        const type = (item as { type?: unknown }).type;
        if (type === "chunk") assertValidFakeChunk(item);
      }
      yield item;
    }
  }
}

/**
 * Replace every registered provider (openai, anthropic, gemini, …) with the
 * FakeProvider, registered with no required credentials. This makes
 * `isProviderConfigured` return true and `getProvider` return a fake on every
 * resolution path — so agent/LLM nodes never demand a real API key.
 *
 * Call again after node registration: providers self-register on import, so a
 * package loaded during registry setup can add a real provider afterwards.
 */
export function fakeAllProviders(): void {
  for (const id of listRegisteredProviderIds()) {
    registerProvider(id, FakeProvider, {});
  }
}

/** A `resolveProvider` implementation that always hands back a fake. */
export const resolveFakeProvider = async (): Promise<BaseProvider> =>
  new FakeProvider() as unknown as BaseProvider;

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
  "lib.mail",
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

export interface FakeMeta {
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
    return {
      type,
      uri: `data:${mime};base64,${TINY_PNG_BASE64}`,
      data: TINY_PNG_BASE64,
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
export function fakeExecutor(meta: FakeMeta | undefined): NodeExecutor {
  return {
    async process(
      inputs: Record<string, unknown>
    ): Promise<Record<string, unknown>> {
      const outputs = meta?.outputs ?? [];
      if (outputs.length === 0) return inputs;
      const result: Record<string, unknown> = {};
      for (const slot of outputs) {
        result[slot.name] = fakeValueForType(baseType(slot));
      }
      return result;
    }
  } as NodeExecutor;
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
): (node: { id: string; type: string }) => NodeExecutor {
  const echo = {
    async process(inputs: Record<string, unknown>) {
      return inputs;
    }
  } as NodeExecutor;

  return (node) => {
    const registry = getRegistry();
    if (!registry || !registry.has(node.type)) {
      if (!passthrough && registry) return registry.resolve(node);
      return echo;
    }
    if (isStructural(node.type)) return registry.resolve(node);

    const meta = registry.getMetadata(node.type) as FakeMeta | undefined;
    const fake = shouldFakeNode(node.type, meta);
    debug(`[fake-runtime] ${node.id} ${node.type} -> ${fake ? "FAKE" : "REAL"}`);
    return fake ? fakeExecutor(meta) : registry.resolve(node);
  };
}
