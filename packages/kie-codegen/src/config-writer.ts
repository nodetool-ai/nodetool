import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ModuleConfig, NodeConfig } from "./types.js";

const MODULE_DEFAULTS: Record<string, Pick<ModuleConfig, "defaultPollInterval" | "defaultMaxAttempts">> = {
  image: { defaultPollInterval: 1500, defaultMaxAttempts: 400 },
  audio: { defaultPollInterval: 4000, defaultMaxAttempts: 120 },
  video: { defaultPollInterval: 8000, defaultMaxAttempts: 450 }
};

function renderConfig(moduleName: string, nodes: NodeConfig[]): string {
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
  const modules = new Map<string, NodeConfig[]>();
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

  for (const moduleName of ["image", "audio", "video"]) {
    const moduleNodes = modules.get(moduleName) ?? [];
    await writeFile(
      join(outputDir, `${moduleName}.ts`),
      renderConfig(moduleName, moduleNodes),
      "utf8"
    );
  }
}
