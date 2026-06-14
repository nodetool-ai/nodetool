/**
 * Build the E2E suite consumed by web/e2e-runner.html.
 *
 * Reads suite.config.json, copies each referenced workflow graph into
 * web/public/e2e-suite/<id>.json, and writes manifest.json (the file the
 * harness fetches at runtime). Bundling the graphs into /public keeps the
 * harness independent of backend example APIs — the backend is only used to
 * execute, not to serve workflow definitions.
 *
 * Run directly: `tsx web/tests/e2e-runner/prepareSuite.ts`
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
// web/tests/e2e-runner → web/tests → web → repo root
const REPO_ROOT = resolve(CURRENT_DIR, "../../..");
const WEB_ROOT = resolve(CURRENT_DIR, "../..");
const SUITE_OUT_DIR = resolve(WEB_ROOT, "public/e2e-suite");
const CONFIG_PATH = resolve(CURRENT_DIR, "suite.config.json");

/** Env vars that, when present, unlock workflows tagged with requiresSecrets. */
const KNOWN_SECRET_KEYS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "MISTRAL_API_KEY",
  "REPLICATE_API_TOKEN",
  "FAL_KEY",
  "HF_TOKEN"
];

interface SuiteConfigEntry {
  id: string;
  name: string;
  source?: string;
  sourceFile: string;
  params?: Record<string, unknown>;
  requiresSecrets?: string[];
  expect?: Record<string, unknown>;
  tags?: string[];
}

interface ManifestEntry {
  id: string;
  name: string;
  source?: string;
  file: string;
  params: Record<string, unknown>;
  requiresSecrets?: string[];
  expect?: Record<string, unknown>;
  tags?: string[];
}

export function prepareSuite(): { count: number; outDir: string } {
  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as {
    workflows: SuiteConfigEntry[];
  };

  rmSync(SUITE_OUT_DIR, { recursive: true, force: true });
  mkdirSync(SUITE_OUT_DIR, { recursive: true });

  const secretsAvailable = KNOWN_SECRET_KEYS.filter((k) => !!process.env[k]);
  const manifestWorkflows: ManifestEntry[] = [];

  for (const entry of config.workflows) {
    const sourcePath = resolve(REPO_ROOT, entry.sourceFile);
    const raw = JSON.parse(readFileSync(sourcePath, "utf-8")) as {
      graph?: { nodes?: unknown[]; edges?: unknown[] };
      nodes?: unknown[];
      edges?: unknown[];
    };
    const graph = {
      nodes: raw.graph?.nodes ?? raw.nodes ?? [],
      edges: raw.graph?.edges ?? raw.edges ?? []
    };
    writeFileSync(
      resolve(SUITE_OUT_DIR, `${entry.id}.json`),
      JSON.stringify({ graph }, null, 2)
    );
    manifestWorkflows.push({
      id: entry.id,
      name: entry.name,
      source: entry.source,
      file: `/e2e-suite/${entry.id}.json`,
      params: entry.params ?? {},
      requiresSecrets: entry.requiresSecrets,
      expect: entry.expect,
      tags: entry.tags
    });
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    secretsAvailable,
    workflows: manifestWorkflows
  };
  writeFileSync(
    resolve(SUITE_OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );

  return { count: manifestWorkflows.length, outDir: SUITE_OUT_DIR };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { count, outDir } = prepareSuite();
  console.log(`[prepareSuite] Wrote ${count} workflows + manifest to ${outDir}`);
}
