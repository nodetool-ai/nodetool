#!/usr/bin/env node
/**
 * E2E harness backend — runs the real NodeTool HTTP+WebSocket backend with an
 * in-memory SQLite database, tailored for the web E2E test runner
 * (`web/e2e-runner.html`).
 *
 * Differences from `screenshot-server.ts`:
 *   - No mock data seeding. The harness sends each workflow graph inline over
 *     the WebSocket `run_job` command, so the DB only needs to exist.
 *   - `passthroughUnknownNodes` is enabled so CLI fixture workflows that use the
 *     `test.Input` placeholder node type execute against the real registry.
 *   - Provider resolution prefers a real provider when its API key is present
 *     (so agent/LLM workflows run for real), and falls back to a deterministic
 *     ScriptedProvider otherwise (so the suite stays green in CI without keys).
 *   - OpenTelemetry is initialised so `NODETOOL_TRACE_FILE` captures per-run
 *     JSONL traces that the harness attaches as artifacts.
 *
 * Usage (via the Playwright globalSetup — not normally invoked directly):
 *   tsx packages/websocket/src/e2e-server.ts
 *
 * Environment:
 *   PORT                       TCP port (default 7777)
 *   HOST                       bind address (default 127.0.0.1)
 *   SECRETS_MASTER_KEY         base64 master key (a test default is used if unset)
 *   NODETOOL_E2E_EXAMPLES_DIR  examples dir served at /api/examples (optional)
 *   NODETOOL_TRACE_FILE        JSONL trace output path (optional)
 */

import { initTestDb } from "@nodetool-ai/models";
import { initMasterKey } from "@nodetool-ai/security";
import {
  ScriptedProvider,
  autoScript,
  getProvider,
  isProviderConfigured,
  type BaseProvider
} from "@nodetool-ai/runtime";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { createTestUiServer } from "./test-ui-server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 7777);
const HOST = process.env.HOST ?? "127.0.0.1";

// Base64-encoded 32-byte placeholder key used only for E2E tests. Never use in
// production. Matches the convention in web/tests/globalSetup.ts.
const E2E_TEST_MASTER_KEY_B64 = "RTJFX1RFU1RfS0VZX0RPX05PVF9VU0VfSU5fUFJPRCE=";

const scriptedProvider = (): BaseProvider =>
  new ScriptedProvider([
    autoScript({
      plan: {
        title: "Agent task",
        steps: [{ id: "s1", instructions: "Complete the objective", depends_on: [] }]
      },
      text: "deterministic e2e agent response"
    })
  ]);

/**
 * Resolve a provider for the given id. Uses a real provider only when its
 * credentials are configured (so agent/LLM workflows run for real when a key is
 * present); otherwise falls back to a deterministic ScriptedProvider so the
 * suite stays green in CI without API keys.
 */
async function resolveProvider(providerId: string): Promise<BaseProvider> {
  const getSecret = async () => null;
  try {
    if (await isProviderConfigured(providerId, getSecret)) {
      return await getProvider(providerId, getSecret);
    }
  } catch {
    // fall through to the scripted provider
  }
  return scriptedProvider();
}

function resolveExamplesDir(): string | undefined {
  const fromEnv = process.env.NODETOOL_E2E_EXAMPLES_DIR;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  // Compiled to packages/websocket/dist/e2e-server.js → up 3 to repo root.
  const repoRoot = resolve(__dirname, "..", "..", "..");
  const candidates = [
    resolve(repoRoot, "examples", "workflows"),
    resolve(repoRoot, "packages", "base-nodes", "nodetool", "examples", "nodetool-base")
  ];
  return candidates.find((dir) => existsSync(dir));
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production" && !process.env.SECRETS_MASTER_KEY) {
    throw new Error("[e2e-server] SECRETS_MASTER_KEY must be set when NODE_ENV=production");
  }
  process.env.SECRETS_MASTER_KEY =
    process.env.SECRETS_MASTER_KEY ?? E2E_TEST_MASTER_KEY_B64;

  // Optional telemetry — only spins up exporters when a sink is configured.
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

  const examplesDir = resolveExamplesDir();
  const srv = createTestUiServer({
    port: PORT,
    host: HOST,
    passthroughUnknownNodes: true,
    resolveProvider,
    ...(examplesDir ? { examplesDir } : {})
  });
  await srv.listen();

  console.log(
    `[e2e-server] Ready on http://${HOST}:${PORT} (${srv.info.metadataCount} nodes registered)` +
      (examplesDir ? ` examples=${examplesDir}` : "")
  );
  // Human-readable readiness marker in the logs. The Playwright globalSetup
  // gates on the backend accepting TCP connections (waitForPort), not on this
  // line.
  process.stdout.write("[e2e-server] READY\n");
}

main().catch((error) => {
  console.error("[e2e-server] Failed to start:", error);
  process.exit(1);
});
