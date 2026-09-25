import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { KieModuleName, ModuleConfig, NodeConfig } from "./types.js";

export const MODULE_NAMES: readonly KieModuleName[] = [
  "image",
  "audio",
  "video"
];

const MODULE_DEFAULTS = {
  image: { defaultPollInterval: 1500, defaultMaxAttempts: 400 },
  audio: { defaultPollInterval: 4000, defaultMaxAttempts: 120 },
  video: { defaultPollInterval: 8000, defaultMaxAttempts: 450 }
} satisfies Record<
  KieModuleName,
  Pick<ModuleConfig, "defaultPollInterval" | "defaultMaxAttempts">
>;

function moduleOf(node: NodeConfig): KieModuleName {
  if (node.moduleName) return node.moduleName;
  if (node.outputType === "video") return "video";
  if (node.outputType === "audio") return "audio";
  return "image";
}

/** Bucket parsed nodes into the three shipped module configs, in order. */
export function buildKieModuleConfigs(
  nodes: NodeConfig[]
): Map<KieModuleName, ModuleConfig> {
  const byModule = new Map<KieModuleName, NodeConfig[]>();
  for (const node of nodes) {
    const moduleName = moduleOf(node);
    if (!byModule.has(moduleName)) {
      byModule.set(moduleName, []);
    }
    byModule.get(moduleName)!.push(node);
  }

  const configs = new Map<KieModuleName, ModuleConfig>();
  for (const moduleName of MODULE_NAMES) {
    configs.set(moduleName, {
      moduleName,
      ...MODULE_DEFAULTS[moduleName],
      nodes: byModule.get(moduleName) ?? []
    });
  }
  return configs;
}

export function renderKieConfigModule(config: ModuleConfig): string {
  return [
    "import type { ModuleConfig } from \"../types.js\";",
    "",
    `export const ${config.moduleName}Config: ModuleConfig = ${JSON.stringify(config, null, 2)};`,
    ""
  ].join("\n");
}

/** Inverse of `renderKieConfigModule`. */
export function parseKieConfigModule(source: string): ModuleConfig {
  const start = source.indexOf("= {");
  const end = source.lastIndexOf("};");
  if (start < 0 || end < start) {
    throw new Error("Not a generated KIE config module");
  }
  // SAFETY: the text between the markers is the JSON.stringify output
  // renderKieConfigModule wrote for a ModuleConfig.
  return JSON.parse(source.slice(start + 2, end + 1)) as ModuleConfig;
}

/** Nodes from the config modules currently on disk. */
export async function readKieConfigs(
  outputDir = join(process.cwd(), "src", "configs")
): Promise<NodeConfig[]> {
  const nodes: NodeConfig[] = [];
  for (const moduleName of MODULE_NAMES) {
    const source = await readFile(join(outputDir, `${moduleName}.ts`), "utf8");
    nodes.push(...parseKieConfigModule(source).nodes);
  }
  return nodes;
}

export async function writeKieConfigs(
  nodes: NodeConfig[],
  outputDir = join(process.cwd(), "src", "configs")
): Promise<void> {
  const configs = buildKieModuleConfigs(nodes);
  for (const moduleName of MODULE_NAMES) {
    await writeFile(
      join(outputDir, `${moduleName}.ts`),
      renderKieConfigModule(configs.get(moduleName)!),
      "utf8"
    );
  }
}
