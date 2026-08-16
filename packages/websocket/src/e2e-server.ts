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
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  createFakeExecutorResolver,
  fakeAllProviders,
  resolveFakeProvider
} from "./fake-runtime.js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { createTestUiServer } from "./test-ui-server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 7777);
const HOST = process.env.HOST ?? "127.0.0.1";

// Base64-encoded 32-byte placeholder key used only for E2E tests.
const E2E_TEST_MASTER_KEY_B64 = "RTJFX1RFU1RfS0VZX0RPX05PVF9VU0VfSU5fUFJPRCE=";

async function main(): Promise<void> {
  if (
    process.env.NODE_ENV === "production" &&
    !process.env.SECRETS_MASTER_KEY
  ) {
    throw new Error(
      "[e2e-server] SECRETS_MASTER_KEY must be set when NODE_ENV=production"
    );
  }
  process.env.SECRETS_MASTER_KEY =
    process.env.SECRETS_MASTER_KEY ?? E2E_TEST_MASTER_KEY_B64;

  const traceFile = process.env.NODETOOL_TRACE_FILE;
  if (traceFile || process.env.NODETOOL_TRACE_STDOUT) {
    const { initTelemetry } = await import("@nodetool-ai/runtime");
    const telemetryOptions: Parameters<typeof initTelemetry>[0] = {
      serviceName: "nodetool-e2e",
      silent: true
    };
    if (traceFile) {
      telemetryOptions.traceFile = traceFile;
    }
    await initTelemetry(telemetryOptions);
  }

  initTestDb();
  await initMasterKey();
  fakeAllProviders();

  let registry: NodeRegistry | null = null;

  const examplesDir = resolveExamplesDir();
  const serverOptions: Parameters<typeof createTestUiServer>[0] = {
    port: PORT,
    host: HOST,
    passthroughUnknownNodes: true,
    configureRegistry: (r) => {
      registry = r;
      // Providers self-register on import; re-fake after registry setup in case
      // any provider registration happened during node registration.
      fakeAllProviders();
    },
    resolveExecutor: createFakeExecutorResolver(() => registry),
    resolveProvider: resolveFakeProvider
  };
  if (examplesDir) {
    serverOptions.examplesDir = examplesDir;
  }
  const srv = createTestUiServer(serverOptions);
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
    resolve(
      repoRoot,
      "packages",
      "base-nodes",
      "nodetool",
      "examples",
      "nodetool-base"
    ),
    resolve(repoRoot, "examples", "workflows")
  ];
  return candidates.find((dir) => existsSync(dir));
}

main().catch((error) => {
  console.error("[e2e-server] Failed to start:", error);
  process.exit(1);
});
