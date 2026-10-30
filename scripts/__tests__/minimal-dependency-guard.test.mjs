import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectMinimalTree } from "../minimal-dependency-guard.mjs";

const temporary = [];
function fixture(files, manifest = {}) {
  const directory = mkdtempSync(join(tmpdir(), "minimal-guard-"));
  temporary.push(directory);
  writeFileSync(join(directory, "package.json"), JSON.stringify({ name: "lean-fixture", ...manifest }));
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(join(directory, "dist"), { recursive: true });
    writeFileSync(join(directory, "dist", name), body);
  }
  return directory;
}
afterEach(() => { for (const directory of temporary.splice(0)) { rmSync(directory, { recursive: true, force: true }); } });
describe("minimal dependency guard", () => {
  it("counts inspected runtime and declaration files", () => {
    expect(inspectMinimalTree([fixture({ "index.js": "export const ready = true", "index.d.ts": "export declare const ready: boolean" })])).toEqual({ inspectedFiles: 2, packages: 1 });
  });
  it("fails a deliberately forbidden declaration import", () => {
    expect(() => inspectMinimalTree([fixture({ "index.d.ts": "export { Browser } from '@nodetool-ai/browser';" })])).toThrow("Forbidden minimal dependency");
  });
  it("fails dynamic runtime imports and optional dependency edges", () => {
    expect(() => inspectMinimalTree([fixture({ "index.js": "await import('node-av')" })])).toThrow("node-av");
    expect(() => inspectMinimalTree([fixture({ "index.js": "export {}" }, { optionalDependencies: { sharp: "*" } })])).toThrow("sharp");
  });
  it("ignores examples in comments and uninstalled optional peers", () => {
    expect(inspectMinimalTree([fixture({ "index.d.ts": '/** import("@nodetool-ai/browser") is an example */\nexport declare const ready: boolean' }, { peerDependencies: { "@aws-sdk/client-rds-data": "*" }, peerDependenciesMeta: { "@aws-sdk/client-rds-data": { optional: true } } })]).inspectedFiles).toBe(1);
  });
  it("rejects required peers and declaration import types", () => {
    expect(() => inspectMinimalTree([fixture({ "index.js": "export {}" }, { peerDependencies: { "@aws-sdk/client-rds-data": "*" } })])).toThrow("Forbidden");
    expect(() => inspectMinimalTree([fixture({ "index.d.ts": 'export type Browser = import("@nodetool-ai/browser").Browser;' })])).toThrow("Forbidden");
  });
  it.each(["webgpu", "@huggingface/inference", "@tensorflow/tfjs", "@modelcontextprotocol/sdk", "@aws-sdk/client-s3", "@swc/core"])("rejects forbidden external package %s", name => {
    expect(() => inspectMinimalTree([fixture({ "index.d.ts": `export type Value = import("${name}").Value` })])).toThrow("Forbidden");
  });
  it("follows external package exports into declarations without scanning unused adapters", () => {
    const root = fixture({ "index.js": 'import { ready } from "third-party"; export { ready };' });
    const external = join(root, "node_modules", "third-party");
    mkdirSync(external, { recursive: true });
    writeFileSync(join(external, "package.json"), JSON.stringify({ name: "third-party", type: "module", exports: { ".": { types: "./index.d.ts", import: "./index.js" } } }));
    writeFileSync(join(external, "index.js"), "export const ready = true;");
    writeFileSync(join(external, "index.d.ts"), "export declare const ready: boolean;");
    writeFileSync(join(external, "unused-adapter.d.ts"), 'export type Cloud = import("@aws-sdk/client-s3").Cloud;');
    expect(inspectMinimalTree([root, external]).inspectedFiles).toBe(3);
    writeFileSync(join(external, "index.d.ts"), 'export type Browser = import("@nodetool-ai/browser").Browser;');
    expect(() => inspectMinimalTree([root, external])).toThrow("Forbidden minimal dependency @nodetool-ai/browser");
    writeFileSync(join(external, "index.d.ts"), "export declare const ready: boolean;");
    writeFileSync(join(external, "index.js"), 'import "webgpu"; export const ready = true;');
    expect(() => inspectMinimalTree([root, external])).toThrow("Forbidden minimal dependency webgpu");
  });
  it("checks declaration type reference directives", () => {
    expect(() => inspectMinimalTree([fixture({ "index.d.ts": '/// <reference types="@nodetool-ai/browser" />\nexport {};' })])).toThrow("Forbidden");
  });
  it("allows CLI only as the selected lean root and rejects cli-full edges", () => {
    const directory = fixture({ "index.js": "export {}" }, { name: "@nodetool-ai/cli" });
    expect(() => inspectMinimalTree([directory])).toThrow("Forbidden");
    expect(inspectMinimalTree([directory], { entryPackageName: "@nodetool-ai/cli" }).packages).toBe(1);
    const broad = fixture({ "index.js": "export {}" }, { name: "@nodetool-ai/cli", dependencies: { "@nodetool-ai/cli-full": "*" } });
    expect(() => inspectMinimalTree([broad], { entryPackageName: "@nodetool-ai/cli" })).toThrow("cli-full");
  });
  it.each(["ink", "react", "react-reconciler", "@nodetool-ai/deploy", "@nodetool-ai/compute"])("rejects terminal or deployment overhead %s", name => {
    expect(() => inspectMinimalTree([fixture({ "index.d.ts": `export type Value = import("${name}").Value` })], { entryPackageName: "@nodetool-ai/cli" })).toThrow("Forbidden");
  });
  it("admits only audited QuickJS packages in the explicit sandbox profile", () => {
    const sandbox = fixture({ "index.js": "export {}" }, { name: "@nodetool-ai/sandbox-runtime", dependencies: { "quickjs-emscripten-core": "*" } });
    expect(() => inspectMinimalTree([sandbox])).toThrow("Forbidden");
    expect(inspectMinimalTree([sandbox], { profile: "sandbox" }).packages).toBe(1);
    const heavy = fixture({ "index.d.ts": 'export type GPU = import("webgpu").GPU;' }, { name: "@nodetool-ai/sandbox-runtime" });
    expect(() => inspectMinimalTree([heavy], { profile: "sandbox" })).toThrow("webgpu");
  });
  it("audits pure sandbox contract subpaths without treating them as optional packages", () => {
    const directory = fixture({ "index.d.ts": 'export type Contract = import("@nodetool-ai/protocol/sandbox-package").Contract;', "sandbox-package.d.ts": "export interface Contract { readonly id: string }" }, { name: "@nodetool-ai/protocol", exports: { "./sandbox-package": "./dist/sandbox-package.d.ts" } });
    expect(inspectMinimalTree([directory]).inspectedFiles).toBe(2);
    writeFileSync(join(directory, "dist/sandbox-package.d.ts"), 'export type Decoder = import("node-av").Decoder;');
    expect(() => inspectMinimalTree([directory])).toThrow("node-av");
  });
  it("fails when nothing was inspected", () => {
    expect(() => inspectMinimalTree([fixture({})])).toThrow("inspected no");
  });
});
