#!/usr/bin/env node
/**
 * Deterministic fixture-mode generation for the Kie.ai codegen.
 *
 * Reads the checked-in `llms.txt` snapshot and docs-page fixtures named by
 * `fixtures/generator-manifest.json` and writes the manifest's declared outputs
 * into `--out`. It never touches the network, never reads pricing, and emits no
 * timestamps, so two runs over the same fixtures are byte-identical. Live
 * refresh stays in `src/generate.ts` and `src/generate-configs.ts`.
 *
 * Usage:
 *   npx tsx src/fixture-generate.ts --out <dir>
 */

import { parseArgs } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { KieSchemaFetcher } from "./schema-fetcher.js";
import { KieSchemaParser } from "./schema-parser.js";
import { KieNodeGenerator } from "./node-generator.js";
import {
  MODULE_NAMES,
  buildKieModuleConfigs,
  renderKieConfigModule
} from "./config-writer.js";
import { configToManifest, type ManifestEntry } from "./manifest.js";
import type { KieModuleName, NodeConfig } from "./types.js";

export interface KieFixtureEntry {
  url: string;
  doc: string;
}

export interface GeneratorOutputEntry {
  path: string;
  kind: "node-source" | "static-metadata";
}

export interface KieGeneratorManifest {
  provider: "kie";
  llms: string;
  fixtures: KieFixtureEntry[];
  outputs: GeneratorOutputEntry[];
}

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const FIXTURES_DIR = join(PACKAGE_DIR, "fixtures");

export async function readKieGeneratorManifest(
  fixturesDir = FIXTURES_DIR
): Promise<KieGeneratorManifest> {
  const raw = await readFile(
    join(fixturesDir, "generator-manifest.json"),
    "utf8"
  );
  // SAFETY: the manifest is a checked-in file this package owns, and every
  // field it declares is read back below — a missing fixture, an unlisted URL,
  // or an output path outside configs/ and nodes/ throws by name.
  return JSON.parse(raw) as KieGeneratorManifest;
}

/**
 * Build every declared output from the checked-in fixtures.
 *
 * A docs fixture that is missing, or a declared URL the `llms.txt` snapshot no
 * longer lists, is an error: fixture mode must not quietly generate less than
 * the manifest declares.
 */
export async function generateKieFixtureOutputs(
  fixturesDir = FIXTURES_DIR
): Promise<Map<string, string>> {
  const manifest = await readKieGeneratorManifest(fixturesDir);
  const fetcher = new KieSchemaFetcher();
  const parser = new KieSchemaParser();
  const generator = new KieNodeGenerator();

  const llms = await readFile(join(fixturesDir, manifest.llms), "utf8");
  const entries = new Map(
    fetcher.parseLlmsEntries(llms).map((entry) => [entry.url, entry])
  );

  const nodes: NodeConfig[] = [];
  for (const fixture of manifest.fixtures) {
    const entry = entries.get(fixture.url);
    if (!entry) {
      throw new Error(
        `Fixture ${fixture.url} is not listed in the checked-in ${manifest.llms}`
      );
    }
    const docPath = join(fixturesDir, fixture.doc);
    let markdown: string;
    try {
      markdown = await readFile(docPath, "utf8");
    } catch {
      throw new Error(`Missing docs fixture for ${fixture.url}: ${docPath}`);
    }
    const node = parser.parse(markdown, entry);
    if (!node) {
      throw new Error(
        `Docs fixture for ${fixture.url} produced no node config`
      );
    }
    nodes.push(node);
  }

  const configs = buildKieModuleConfigs(nodes);
  const entriesByModule = new Map<KieModuleName, ManifestEntry[]>(
    MODULE_NAMES.map((name) => [name, configToManifest(configs.get(name)!)])
  );

  const files = new Map<string, string>();
  for (const output of manifest.outputs) {
    if (output.kind === "static-metadata") {
      const all = MODULE_NAMES.flatMap(
        (name) => entriesByModule.get(name) ?? []
      );
      files.set(output.path, `${JSON.stringify(all, null, 2)}\n`);
      continue;
    }
    const [kind, moduleName] = nodeSourceTarget(output.path);
    const config = configs.get(moduleName)!;
    files.set(
      output.path,
      kind === "configs"
        ? renderKieConfigModule(config)
        : `${generator.generateModule(config)}\n`
    );
  }
  return files;
}

function nodeSourceTarget(path: string): ["configs" | "nodes", KieModuleName] {
  const parts = path.split("/");
  const base = (parts.pop() ?? path).replace(/\.ts$/, "");
  const dir = parts.pop();
  if (dir !== "configs" && dir !== "nodes") {
    throw new Error(
      `Node-source output ${path} must live under configs/ or nodes/`
    );
  }
  const moduleName = MODULE_NAMES.find((name) => name === base);
  if (!moduleName) {
    throw new Error(
      `Node-source output ${path} names no shipped module (${MODULE_NAMES.join(", ")})`
    );
  }
  return [dir, moduleName];
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { out: { type: "string" } } });
  const outDir = values.out;
  if (!outDir) {
    throw new Error("--out <dir> is required");
  }
  const files = await generateKieFixtureOutputs();
  for (const [relPath, content] of files) {
    const target = join(outDir, relPath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
  console.log(`Wrote ${files.size} fixture-mode output(s) to ${outDir}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
