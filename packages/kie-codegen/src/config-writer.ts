import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { KieModuleName, ModuleConfig, NodeConfig } from "./types.js";

const MODULE_NAMES: readonly KieModuleName[] = ["image", "audio", "video"];

const MODULE_DEFAULTS = {
  image: { defaultPollInterval: 1500, defaultMaxAttempts: 400 },
  audio: { defaultPollInterval: 4000, defaultMaxAttempts: 120 },
  video: { defaultPollInterval: 8000, defaultMaxAttempts: 450 }
} satisfies Record<
  KieModuleName,
  Pick<ModuleConfig, "defaultPollInterval" | "defaultMaxAttempts">
>;

function renderConfig(moduleName: KieModuleName, nodes: NodeConfig[]): string {
  const constName = `${moduleName}Config`;
  const config: ModuleConfig = {
    moduleName,
    ...MODULE_DEFAULTS[moduleName],
    nodes
  };

  return [
    "import type { ModuleConfig } from \"../types.js\";",
    "",
    `export const ${constName}: ModuleConfig = ${JSON.stringify(config, null, 2)};`,
    ""
  ].join("\n");
}

export async function writeKieConfigs(
  nodes: NodeConfig[],
  outputDir = join(process.cwd(), "src", "configs")
): Promise<void> {
  const modules = new Map<KieModuleName, NodeConfig[]>();
  for (const node of nodes) {
    const moduleName =
      node.moduleName ??
      (node.outputType === "video"
        ? "video"
        : node.outputType === "audio"
          ? "audio"
          : "image");
    if (!modules.has(moduleName)) {
      modules.set(moduleName, []);
    }
    modules.get(moduleName)!.push(node);
  }

  for (const moduleName of MODULE_NAMES) {
    const moduleNodes = modules.get(moduleName) ?? [];
    await writeFile(
      join(outputDir, `${moduleName}.ts`),
      renderConfig(moduleName, moduleNodes),
      "utf8"
    );
  }
}
