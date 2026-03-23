#!/usr/bin/env tsx
/**
 * CLI entry point for generating Kie.ai node files.
 *
 * Usage:
 *   tsx src/generate.ts --all
 *   tsx src/generate.ts --module image
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { KieNodeGenerator } from "./node-generator.js";
import type { ModuleConfig } from "./types.js";

async function loadConfigs(): Promise<ModuleConfig[]> {
  const configs: ModuleConfig[] = [];
  const { imageConfig } = await import("./configs/image.js");
  const { audioConfig } = await import("./configs/audio.js");
  const { videoConfig } = await import("./configs/video.js");
  configs.push(imageConfig, audioConfig, videoConfig);
  return configs;
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

  const outputDir = join(process.cwd(), "..", "kie-nodes", "src", "generated");
  mkdirSync(outputDir, { recursive: true });

  const generator = new KieNodeGenerator();
  const allConfigs = await loadConfigs();
  const configs = isAll
    ? allConfigs
    : allConfigs.filter((c) => c.moduleName === moduleName);

  if (configs.length === 0) {
    console.error(`No config found for module: ${moduleName}`);
    process.exit(1);
  }

  let totalNodes = 0;
  for (const config of configs) {
    const code = generator.generateModule(config);
    const outPath = join(outputDir, `${config.moduleName}.ts`);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, code, "utf8");
    console.log(`Wrote ${config.nodes.length} nodes to ${outPath}`);
    totalNodes += config.nodes.length;
  }

  console.log(`\nTotal: ${totalNodes} nodes generated`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
