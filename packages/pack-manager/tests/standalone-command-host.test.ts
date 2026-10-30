import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import type { CatalogPack, NodeCatalogIndex } from "@nodetool-ai/pack-core";
import { configureCliPackHost, loadCliPackSnapshot, loaderContextForSnapshot } from "../src/packs/host.js";

const version = "0.8.4";
const feature: CatalogPack = { id: "cli-mcp", kind: "cli-feature", npm: { name: "@nodetool-ai/cli-mcp", version, integrity: "sha512-mcp" }, registrar: "feature", provides: [], requires: ["core", "text"], runtimeLibraries: [], secrets: [], scriptAllowlist: [], installBytes: 0, nodeCount: 0 };
const nodes: CatalogPack[] = ["core", "text"].map(id => ({ ...feature, id, kind: "core", npm: { ...feature.npm, name: `@nodetool-ai/${id}-nodes` }, registrar: "register", requires: [], nodeCount: 1 }));
const catalog: NodeCatalogIndex = { schemaVersion: 1, coreVersion: version, packs: [feature, ...nodes], owners: {} };
const roots: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function fixture(kind: "project" | "npx" | "global" = "project") {
  const root = await mkdtemp(join(tmpdir(), "standalone-host-")); roots.push(root);
  const modules = kind === "npx" ? join(root, "_npx", "fixture", "node_modules") : kind === "global" ? join(root, "prefix", process.platform === "win32" ? "node_modules" : "lib/node_modules") : join(root, "node_modules");
  const owner = join(modules, feature.npm.name);
  await mkdir(owner, { recursive: true });
  await writeFile(join(owner, "package.json"), JSON.stringify({ name: feature.npm.name, version }));
  await writeFile(join(owner, "index.js"), "");
  const inventory = kind === "global" ? join(owner, "node_modules") : modules;
  for (const node of nodes) {
    const directory = join(inventory, node.npm.name);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "package.json"), JSON.stringify({ name: node.npm.name, version }));
  }
  if (kind === "global") { vi.stubEnv("npm_config_prefix", join(root, "prefix")); }
  return { root, modules, owner, inventory, entry: pathToFileURL(join(owner, "index.js")).href };
}

it.each(["project", "npx", "global"] as const)("reads an admitted standalone MCP %s host and its core/text nodes without enabling installation", async kind => {
  const f = await fixture(kind);
  configureCliPackHost(f.entry, { catalog });
  const snapshot = await loadCliPackSnapshot();
  expect(snapshot.mode).toMatchObject({ cliRoot: f.owner, coreVersion: version, nodeModulesRoot: f.inventory, kind: kind === "npx" ? "npx" : "unsupported" });
  expect(snapshot.packs.map(pack => pack.id)).toEqual(expect.arrayContaining(["core", "text"]));
  expect(loaderContextForSnapshot(snapshot).install).toMatchObject({ supported: false, command: null, reason: expect.stringContaining("npm install -g @nodetool-ai/cli") });
});

it("rejects unknown, duplicate, or mismatched standalone owners", async () => {
  const f = await fixture();
  configureCliPackHost(f.entry, { catalog: { ...catalog, packs: nodes } });
  await expect(loadCliPackSnapshot()).rejects.toThrow("not an admitted CLI feature");
  configureCliPackHost(f.entry, { catalog: { ...catalog, packs: [...catalog.packs, feature] } });
  await expect(loadCliPackSnapshot()).rejects.toThrow("not an admitted CLI feature");
  await writeFile(join(f.owner, "package.json"), JSON.stringify({ name: feature.npm.name, version: "0.8.5" }));
  configureCliPackHost(f.entry, { catalog });
  await expect(loadCliPackSnapshot()).rejects.toThrow("differs from catalog version");
});

it("fails an installed broken or incompatible CLI instead of falling back to standalone", async () => {
  const f = await fixture();
  const cliRoot = join(f.modules, "@nodetool-ai/cli");
  await mkdir(cliRoot, { recursive: true });
  await writeFile(join(cliRoot, "package.json"), JSON.stringify({ name: "@nodetool-ai/cli", version, main: "missing.js" }));
  configureCliPackHost(f.entry, { catalog });
  await expect(loadCliPackSnapshot()).rejects.toThrow("missing.js");
  await writeFile(join(cliRoot, "package.json"), JSON.stringify({ name: "@nodetool-ai/cli", version: "0.8.5", main: "index.js" }));
  await writeFile(join(cliRoot, "index.js"), "");
  configureCliPackHost(f.entry, { catalog });
  await expect(loadCliPackSnapshot()).rejects.toThrow("differs from CLI core version");
});
