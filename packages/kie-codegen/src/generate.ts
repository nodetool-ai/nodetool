#!/usr/bin/env tsx
/**
 * CLI entry point for generating Kie.ai manifest JSON.
 *
 * Usage:
 *   tsx src/generate.ts --all
 *   tsx src/generate.ts --module image
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ModuleConfig, NodeConfig } from "./types.js";

interface ManifestEntry {
  className: string;
  moduleName: string;
  modelId: string;
  title: string;
  description: string;
  outputType: string;
  pollInterval: number;
  maxAttempts: number;
  useSuno?: boolean;
  fields: NodeConfig["fields"];
  uploads?: NodeConfig["uploads"];
  validation?: NodeConfig["validation"];
  paramNames?: NodeConfig["paramNames"];
  conditionalFields?: NodeConfig["conditionalFields"];
}

async function loadConfigs(): Promise<ModuleConfig[]> {
  const { imageConfig } = await import("./configs/image.js");
  const { audioConfig } = await import("./configs/audio.js");
  const { videoConfig } = await import("./configs/video.js");
  return [imageConfig, audioConfig, videoConfig];
}

function configToManifest(config: ModuleConfig): ManifestEntry[] {
  return config.nodes.map((node) => {
    const entry: ManifestEntry = {
      className: node.className,
      moduleName: config.moduleName,
      modelId: node.modelId,
      title: node.title || node.className.replace(/([A-Z])/g, " $1").trim(),
      description: node.description,
      outputType: node.outputType,
      pollInterval: node.pollInterval ?? config.defaultPollInterval ?? 2000,
      maxAttempts: node.maxAttempts ?? config.defaultMaxAttempts ?? 300,
      fields: node.fields
    };
    if (node.useSuno) entry.useSuno = true;
    if (node.uploads?.length) entry.uploads = node.uploads;
    if (node.validation?.length) entry.validation = node.validation;
    if (node.paramNames && Object.keys(node.paramNames).length > 0)
      entry.paramNames = node.paramNames;
    if (node.conditionalFields?.length)
      entry.conditionalFields = node.conditionalFields;
    return entry;
  });
}

async function main() {
  const args = process.argv.slice(2);
  const moduleArg = args.indexOf("--module");
  const isAll = args.includes("--all");
  const moduleName = moduleArg >= 0 ? args[moduleArg + 1] : null;

  if (!isAll && !moduleName) {
    console.error("Usage: --module <name> | --all");
    process.exit(1);
  }

  const outputPath = join(process.cwd(), "..", "kie-nodes", "src", "kie-manifest.json");

  const allConfigs = await loadConfigs();
  const configs = isAll
    ? allConfigs
    : allConfigs.filter((c) => c.moduleName === moduleName);

  if (configs.length === 0) {
    console.error(`No config found for module: ${moduleName}`);
    process.exit(1);
  }

  const manifest: ManifestEntry[] = [];
  for (const config of configs) {
    const entries = configToManifest(config);
    manifest.push(...entries);
    console.log(`${config.moduleName}: ${entries.length} nodes`);
  }

  writeFileSync(outputPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`\nWrote ${manifest.length} nodes to ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
