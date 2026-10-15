import { afterEach, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { NodeCatalogIndex } from "@nodetool-ai/node-catalog";

const exec = promisify(execFile);
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function fixture(duplicateSdk = false) {
  const root = await mkdtemp(join(tmpdir(), "packs-child-")); roots.push(root);
  const realCatalog: NodeCatalogIndex = JSON.parse(await readFile(new URL("../../../node-catalog/data/index.json", import.meta.url), "utf8"));
  const pack = realCatalog.packs.find((entry) => entry.id === "fal")!;
  const sdk = join(root, "node_modules/@nodetool-ai/node-sdk");
  const installed = join(root, "node_modules", pack.npm.name);
  for (const directory of [sdk, installed]) { await mkdir(directory, { recursive: true }); }
  await writeFile(join(root, "package.json"), '{"name":"fixture"}');
  await writeFile(join(sdk, "package.json"), '{"name":"@nodetool-ai/node-sdk","main":"index.js"}');
  await writeFile(join(sdk, "index.js"), "module.exports = {};");
  await writeFile(join(installed, "package.json"), JSON.stringify({ name: pack.npm.name, version: realCatalog.coreVersion, type: "module", exports: "./index.js" }));
  await writeFile(join(installed, "index.js"), `export function ${pack.registrar}() {}`);
  if (duplicateSdk) {
    const nested = join(installed, "node_modules/@nodetool-ai/node-sdk"); await mkdir(nested, { recursive: true });
    await writeFile(join(nested, "package.json"), '{"name":"@nodetool-ai/node-sdk","main":"index.js"}');
    await writeFile(join(nested, "index.js"), "module.exports = {};");
  }
  const config = join(root, "check.json");
  await writeFile(config, JSON.stringify({ root, catalog: { ...realCatalog, packs: [pack] } }));
  const verifier = new URL("../../src/packs/installer-load-check.ts", import.meta.url).href;
  const inventory = new URL("../../src/packs/installed.ts", import.meta.url).href;
  const code = `import {readFileSync} from 'node:fs'; import {verifyPackLoads} from ${JSON.stringify(verifier)}; import {readInstalledPacks} from ${JSON.stringify(inventory)};
const {root,catalog}=JSON.parse(readFileSync(process.argv[1],'utf8'));
const mode={kind:'local',cliRoot:root,installRoot:root,nodeModulesRoot:root+'/node_modules',coreVersion:catalog.coreVersion,pathStyle:'posix'};
await verifyPackLoads(readInstalledPacks(mode,catalog),catalog,${duplicateSdk ? "[]" : "process.argv[2] === 'mismatch' ? [{pack:'fal',node_type:'fixture.unregistered'}] : []"},['fal']);`;
  return { config, code };
}
it("fresh child imports installed registrar and compares owned types", async () => {
  const f = await fixture();
  await exec(process.execPath, ["--import", "tsx", "--conditions=nodetool-dev", "--input-type=module", "-e", f.code, f.config]);
  await expect(exec(process.execPath, ["--import", "tsx", "--conditions=nodetool-dev", "--input-type=module", "-e", f.code, f.config, "mismatch"])).rejects.toThrow(/owned node types/);
});
it("fresh child refuses a second node-sdk resolution before registrar imports", async () => {
  const f = await fixture(true);
  await expect(exec(process.execPath, ["--import", "tsx", "--conditions=nodetool-dev", "--input-type=module", "-e", f.code, f.config])).rejects.toThrow(/another node-sdk/);
});
