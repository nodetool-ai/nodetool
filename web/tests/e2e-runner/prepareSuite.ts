/**
 * Build the E2E suite consumed by web/e2e-runner.html.
 *
 * Auto-discovers every workflow graph in the configured example directory,
 * copies each into web/public/e2e-suite/<id>.json, and writes manifest.json
 * (the file the harness fetches). Each workflow's params come from the example
 * file itself (its embedded `params`), with optional per-workflow overrides in
 * suite.config.json. Bundling the graphs into /public keeps the harness
 * independent of backend example APIs — the backend is only used to execute.
 *
 * Run directly: `tsx web/tests/e2e-runner/prepareSuite.ts`
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
// web/tests/e2e-runner → web/tests → web → repo root
const REPO_ROOT = resolve(CURRENT_DIR, "../../..");
const WEB_ROOT = resolve(CURRENT_DIR, "../..");
const SUITE_OUT_DIR = resolve(WEB_ROOT, "public/e2e-suite");
const CONFIG_PATH = resolve(CURRENT_DIR, "suite.config.json");

interface SuiteConfig {
  /** Directory (repo-relative) to discover *.json workflow graphs in. */
  sourceDir: string;
  /** Workflow ids (filename without .json) to skip (e.g. ones needing Python). */
  exclude?: string[];
  /** Default expectation applied to every workflow unless overridden. */
  defaultExpect?: Record<string, unknown>;
  /** Per-workflow overrides keyed by id: params / expect / name. */
  overrides?: Record<
    string,
    {
      name?: string;
      params?: Record<string, unknown>;
      expect?: Record<string, unknown>;
      tags?: string[];
    }
  >;
}

interface ManifestEntry {
  id: string;
  name: string;
  source: string;
  file: string;
  params: Record<string, unknown>;
  expect?: Record<string, unknown>;
  tags?: string[];
}

export function prepareSuite(): { count: number; outDir: string } {
  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as SuiteConfig;
  const sourceDir = resolve(REPO_ROOT, config.sourceDir);
  const exclude = new Set(config.exclude ?? []);
  const overrides = config.overrides ?? {};
  const defaultExpect = config.defaultExpect ?? { status: "completed" };

  rmSync(SUITE_OUT_DIR, { recursive: true, force: true });
  mkdirSync(SUITE_OUT_DIR, { recursive: true });

  const files = readdirSync(sourceDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  const manifestWorkflows: ManifestEntry[] = [];
  for (const fileName of files) {
    const stem = basename(fileName, ".json");
    // Slugify for the on-disk/URL id (template names contain spaces); keep the
    // original stem as the display name.
    const id = stem
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (exclude.has(id) || exclude.has(stem)) continue;

    const raw = JSON.parse(readFileSync(resolve(sourceDir, fileName), "utf-8")) as {
      graph?: { nodes?: unknown[]; edges?: unknown[] };
      nodes?: unknown[];
      edges?: unknown[];
      params?: Record<string, unknown>;
    };
    const graph = {
      nodes: raw.graph?.nodes ?? raw.nodes ?? [],
      edges: raw.graph?.edges ?? raw.edges ?? []
    };
    const override = overrides[id] ?? overrides[stem] ?? {};

    writeFileSync(
      resolve(SUITE_OUT_DIR, `${id}.json`),
      JSON.stringify({ graph }, null, 2)
    );
    manifestWorkflows.push({
      id,
      name: override.name ?? stem,
      source: config.sourceDir,
      file: `/e2e-suite/${id}.json`,
      params: override.params ?? raw.params ?? {},
      expect: override.expect ?? defaultExpect,
      tags: override.tags
    });
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    // Providers are faked on the e2e-server, so no workflow is gated on secrets.
    secretsAvailable: [],
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
