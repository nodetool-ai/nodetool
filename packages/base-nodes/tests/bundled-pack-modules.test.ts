import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BUNDLED_PACK_MODULES } from "../src/server-pack-source.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, "packages/base-nodes/package.json"), "utf8")) as {
  dependencies: Record<string, string>;
};
const catalog = JSON.parse(readFileSync(join(root, "packages/node-catalog/data/index.json"), "utf8")) as {
  packs: { id: string; npm: { name: string } }[];
};
const npmById = new Map(catalog.packs.map((pack) => [pack.id, pack.npm.name]));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

/** Every `importPack(id[, specifier])` target in backend source, as importPack resolves it. */
function importPackTargets(): Set<string> {
  const targets = new Set<string>();
  const call = /importPack(?:<[^>]*>)?\(\s*"([a-z0-9-]+)"(?:\s*,\s*"([^"]+)")?\s*\)/g;
  for (const pkg of readdirSync(join(root, "packages"))) {
    let files: string[];
    try {
      files = sourceFiles(join(root, "packages", pkg, "src"));
    } catch {
      continue;
    }
    for (const file of files) {
      for (const [, id, specifier] of readFileSync(file, "utf8").matchAll(call)) {
        const npm = npmById.get(id);
        if (!npm) {
          throw new Error(`${file} imports unknown pack ${id}`);
        }
        targets.add(specifier === undefined ? npm : specifier.startsWith("@") ? specifier : `${npm}/${specifier}`);
      }
    }
  }
  return targets;
}

function packageName(specifier: string): string {
  return specifier.split("/").slice(0, 2).join("/");
}

describe("bundled pack modules", () => {
  it("covers every importPack target in a package the bundled source compiles in", () => {
    const targets = [...importPackTargets()];
    expect(targets).toContain("@nodetool-ai/integration-nodes");
    const compiledIn = targets.filter((target) => manifest.dependencies[packageName(target)]);
    expect(compiledIn.filter((target) => !(target in BUNDLED_PACK_MODULES))).toEqual([]);
  });

  it("loads the integration pack's ComfyUI and KIE schema resolvers", async () => {
    const integration = await BUNDLED_PACK_MODULES["@nodetool-ai/integration-nodes"]();
    expect(integration).toHaveProperty("resolveComfyWorkflow", expect.any(Function));
    expect(integration).toHaveProperty("resolveKieDynamicSchema", expect.any(Function));
  });
});
