#!/usr/bin/env node
/**
 * E2E harness backend — runs the real NodeTool HTTP+WebSocket backend with an
 * in-memory SQLite database, tailored for the web E2E test runner
 * (`web/e2e-runner.html`). It is fully hermetic: every external provider is
 * faked so the shipped templates run in CI with no API keys and no network.
 *
 * Faking strategy:
 *   - LLM/agent providers: every registered provider id is re-registered with a
 *     FakeProvider (a ScriptedProvider with no required credentials), so
 *     `getProvider`/`isProviderConfigured` and the runner's resolveProvider all
 *     return a configured fake regardless of how a node resolves its provider.
 *   - External / media-generating nodes (fal, replicate, search, http, image /
 *     video / audio generation, …): resolved to a fake executor that returns
 *     type-correct placeholder outputs derived from the node's output metadata,
 *     so downstream nodes and output nodes still receive well-formed values.
 *   - Pure-compute nodes (text, control, data, math, …) run for real.
 *   - Unknown node types (e.g. the `test.Input` placeholder) pass through.
 *
 * Usage (via the Playwright globalSetup — not normally invoked directly):
 *   tsx packages/websocket/src/e2e-server.ts
 *
 * Environment:
 *   PORT / HOST                bind config (default 127.0.0.1:7777)
 *   SECRETS_MASTER_KEY         base64 master key (a test default is used if unset)
 *   NODETOOL_E2E_EXAMPLES_DIR  examples dir served at /api/examples (optional)
 *   NODETOOL_TRACE_FILE        JSONL trace output path (optional)
 */

import { initTestDb } from "@nodetool-ai/models";
import { initMasterKey } from "@nodetool-ai/security";
import {
  ScriptedProvider,
  autoScript,
  registerProvider,
  listRegisteredProviderIds,
  type BaseProvider
} from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { createTestUiServer } from "./test-ui-server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 7777);
const HOST = process.env.HOST ?? "127.0.0.1";

// Base64-encoded 32-byte placeholder key used only for E2E tests.
const E2E_TEST_MASTER_KEY_B64 = "RTJFX1RFU1RfS0VZX0RPX05PVF9VU0VfSU5fUFJPRCE=";

// Valid 1x1 transparent PNG — used as the bytes for faked image/media outputs
// so downstream nodes that decode them don't choke.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==";

// ── Provider faking ─────────────────────────────────────────────────────────

/** A provider that returns deterministic scripted responses; ignores kwargs. */
class FakeProvider extends ScriptedProvider {
  constructor(_kwargs?: Record<string, unknown>) {
    const inner = autoScript({
      plan: {
        title: "Agent task",
        steps: [{ id: "s1", instructions: "Complete the objective", depends_on: [] }]
      },
      text: "deterministic e2e response"
    });
    super([
      (messages, tools) => {
        // eslint-disable-next-line no-console
        console.error(
          `[SCRIPT-DBG] tools=[${tools.map((t) => t.name).join(",")}] roles=[${messages.map((m) => m.role).join(",")}]`
        );
        return inner(messages, tools);
      }
    ]);
  }
}

/**
 * Replace every registered provider (openai, anthropic, gemini, …) with the
 * FakeProvider, registered with no required credentials. This makes
 * `isProviderConfigured` return true and `getProvider` return a fake on every
 * resolution path — so agent/LLM nodes never demand a real API key.
 */
function fakeAllProviders(): void {
  for (const id of listRegisteredProviderIds()) {
    registerProvider(id, FakeProvider, {});
  }
}

// ── Executor faking ─────────────────────────────────────────────────────────

const MEDIA_TYPES = new Set(["image", "audio", "video", "document"]);

// Node namespaces that reach external services (network / API keys) and must be
// faked. Matched as a prefix of the node type.
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
  "lib.rss",
  "lib.pymupdf",
  "lib.sqlite",
  "lib.browser",
  "nodetool.generators.web"
];

// Provider-backed node classes that don't produce media outputs (so the
// media-output heuristic misses them) but still need a real model/provider —
// fake them by class name (last segment of the node type).
const FAKE_NODE_CLASSES = new Set(["AutomaticSpeechRecognition"]);

function isFakeByClass(nodeType: string): boolean {
  return FAKE_NODE_CLASSES.has(nodeType.split(".").pop() ?? "");
}

interface FakeMeta {
  node_type?: string;
  required_settings?: string[] | null;
  outputs?: Array<{ name: string; type?: { type?: string } }> | null;
  properties?: Array<{ name: string; type?: { type?: string } }> | null;
}

// Structural nodes must always run for real: inputs dispatch run params, outputs
// emit results, control routes the graph.
const STRUCTURAL_PREFIXES = [
  "nodetool.input.",
  "nodetool.output.",
  "nodetool.control."
];

function isStructural(nodeType: string): boolean {
  return STRUCTURAL_PREFIXES.some((p) => nodeType.startsWith(p));
}

function baseType(slot: { type?: { type?: string } } | undefined): string {
  return slot?.type?.type ?? "any";
}

function outputsMedia(meta: FakeMeta | undefined): boolean {
  return (meta?.outputs ?? []).some((o) => MEDIA_TYPES.has(baseType(o)));
}

function inputsMedia(meta: FakeMeta | undefined): boolean {
  return (meta?.properties ?? []).some((p) => MEDIA_TYPES.has(baseType(p)));
}

function needsSecret(meta: FakeMeta | undefined): boolean {
  return Array.isArray(meta?.required_settings) && meta!.required_settings!.length > 0;
}

function isExternal(nodeType: string): boolean {
  return EXTERNAL_PREFIXES.some((p) => nodeType.startsWith(p));
}

/** Build a type-correct placeholder for a single output slot. */
function fakeValueForType(type: string): unknown {
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
      return "deterministic e2e output";
    case "int":
      return 0;
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

/** A fake executor that emits placeholder outputs for a node's declared slots. */
function fakeExecutor(meta: FakeMeta | undefined) {
  return {
    async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
      const outputs = meta?.outputs ?? [];
      if (outputs.length === 0) return inputs;
      const result: Record<string, unknown> = {};
      for (const slot of outputs) {
        result[slot.name] = fakeValueForType(baseType(slot));
      }
      return result;
    }
  };
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production" && !process.env.SECRETS_MASTER_KEY) {
    throw new Error("[e2e-server] SECRETS_MASTER_KEY must be set when NODE_ENV=production");
  }
  process.env.SECRETS_MASTER_KEY =
    process.env.SECRETS_MASTER_KEY ?? E2E_TEST_MASTER_KEY_B64;

  const traceFile = process.env.NODETOOL_TRACE_FILE;
  if (traceFile || process.env.NODETOOL_TRACE_STDOUT) {
    const { initTelemetry } = await import("@nodetool-ai/runtime");
    await initTelemetry({
      serviceName: "nodetool-e2e",
      silent: true,
      ...(traceFile ? { traceFile } : {})
    });
  }

  initTestDb();
  await initMasterKey();
  fakeAllProviders();

  let registry: NodeRegistry | null = null;

  const examplesDir = resolveExamplesDir();
  const srv = createTestUiServer({
    port: PORT,
    host: HOST,
    passthroughUnknownNodes: true,
    configureRegistry: (r) => {
      registry = r;
      // Providers self-register on import; re-fake after registry setup in case
      // any provider registration happened during node registration.
      fakeAllProviders();
    },
    resolveExecutor: (node) => {
      const reg = registry;
      if (!reg || !reg.has(node.type)) {
        // Unknown node (e.g. test.Input) — echo inputs through.
        return { async process(inputs: Record<string, unknown>) { return inputs; } };
      }
      // Structural nodes (input/output/control) always run for real.
      if (isStructural(node.type)) return reg.resolve(node);
      const meta = reg.getMetadata(node.type) as FakeMeta | undefined;
      const fake =
        needsSecret(meta) ||
        outputsMedia(meta) ||
        inputsMedia(meta) ||
        isExternal(node.type) ||
        isFakeByClass(node.type);
      // eslint-disable-next-line no-console
      console.error(
        `[EXEC-DBG] ${node.id} ${node.type} -> ${fake ? "FAKE" : "REAL"} (needsSecret=${needsSecret(meta)} outMedia=${outputsMedia(meta)} inMedia=${inputsMedia(meta)} ext=${isExternal(node.type)})`
      );
      if (fake) {
        return fakeExecutor(meta);
      }
      return reg.resolve(node);
    },
    resolveProvider: async () =>
      new FakeProvider() as unknown as BaseProvider,
    ...(examplesDir ? { examplesDir } : {})
  });
  await srv.listen();

  console.log(
    `[e2e-server] Ready on http://${HOST}:${PORT} (${srv.info.metadataCount} nodes registered)` +
      (examplesDir ? ` examples=${examplesDir}` : "")
  );
  // Human-readable readiness marker; the Playwright globalSetup gates on the
  // backend accepting TCP connections (waitForPort), not on this line.
  process.stdout.write("[e2e-server] READY\n");
}

function resolveExamplesDir(): string | undefined {
  const fromEnv = process.env.NODETOOL_E2E_EXAMPLES_DIR;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const repoRoot = resolve(__dirname, "..", "..", "..");
  const candidates = [
    resolve(repoRoot, "packages", "base-nodes", "nodetool", "examples", "nodetool-base"),
    resolve(repoRoot, "examples", "workflows")
  ];
  return candidates.find((dir) => existsSync(dir));
}

main().catch((error) => {
  console.error("[e2e-server] Failed to start:", error);
  process.exit(1);
});
