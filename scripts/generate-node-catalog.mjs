import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CATALOG_PACKS } from "./node-catalog/packs.mjs";
import { assertCatalogMatches, generateCatalog } from "./node-catalog/generate.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptPath), "..");
const dataDir = join(root, "packages/node-catalog/data");

async function worker(outputDir) {
  const { NodeRegistry } = await import("@nodetool-ai/node-sdk");
  const { version } = JSON.parse(await readFile(join(root, "packages/cli/package.json"), "utf8"));
  const catalog = await generateCatalog(CATALOG_PACKS, {
    coreVersion: version,
    loadPack: (name) => import(name),
    readManifest: async (name) => JSON.parse(await readFile(join(root, "packages", name.slice("@nodetool-ai/".length), "package.json"), "utf8")),
    createRegistry: () => new NodeRegistry()
  });
  await writeFile(join(outputDir, "index.json"), catalog.index);
  await writeFile(join(outputDir, "nodes.ndjson"), catalog.nodes);
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--worker" && args.length === 2) {
    await worker(args[1]);
    return;
  }
  if (args.length > 1 || args.some((arg) => arg !== "--check")) {
    throw new Error("Usage: node scripts/generate-node-catalog.mjs [--check]");
  }
  const temp = await mkdtemp(join(tmpdir(), "nodetool-node-catalog-"));
  try {
    await new Promise((resolveChild, reject) => {
      const child = spawn(process.execPath, [scriptPath, "--worker", temp], {
        cwd: root,
        env: { HOME: temp, USERPROFILE: temp, NODE_ENV: "production", LANG: "C", LC_ALL: "C" },
        stdio: "inherit"
      });
      child.once("error", reject);
      child.once("exit", (code, signal) => code === 0 ? resolveChild() : reject(new Error(`Catalog generator exited ${code ?? signal}`)));
    });
    const index = await readFile(join(temp, "index.json"), "utf8");
    const nodes = await readFile(join(temp, "nodes.ndjson"), "utf8");
    const nodeCount = Object.keys(JSON.parse(index).owners).length;
    if (args.includes("--check")) {
      assertCatalogMatches({ index, nodes, nodeCount }, {
        index: await readFile(join(dataDir, "index.json"), "utf8"),
        nodes: await readFile(join(dataDir, "nodes.ndjson"), "utf8")
      });
      console.log(`Node catalog matches (${nodeCount} types compared).`);
    } else {
      await writeFile(join(dataDir, "index.json"), index);
      await writeFile(join(dataDir, "nodes.ndjson"), nodes);
      console.log(`Generated node catalog (${nodeCount} types).`);
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

await main();
