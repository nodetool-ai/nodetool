import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RELEASE_FILES = [
  "scripts/publish-packages.mjs",
  "scripts/smoke-packed-cli.mjs",
  "scripts/release/pin-catalog.mjs",
  "scripts/release/install-pins.mjs",
  "scripts/release/commands.mjs",
  "scripts/node-catalog/tiers.mjs",
  "scripts/node-catalog/generate.mjs",
  "packages/node-catalog/build.mjs"
];

function fixtureRepository(root) {
  const source = resolve(import.meta.dirname, "../..");
  for (const file of RELEASE_FILES) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    copyFileSync(join(source, file), join(root, file));
  }
  writeFileSync(join(root, "package.json"), '{"type":"module"}');
  mkdirSync(join(root, "packages/protocol/dist"), { recursive: true });
  writeFileSync(join(root, "packages/protocol/dist/runtime-npm-packages.js"), 'export const RUNTIME_NPM_PACKAGES = { typescript: { npmPackages: ["typescript@npm:@typescript/typescript6@6.0.2"], packageNames: ["typescript"] } };');
  for (const name of ["mediabunny", "@mediabunny/server"]) {
    mkdirSync(join(root, "node_modules", name), { recursive: true });
    writeFileSync(join(root, "node_modules", name, "package.json"), JSON.stringify({ name, version: "4.5.6" }));
  }
  const packages = ["core-nodes", "game-nodes", "game-renderer", "node-catalog", "cli"];
  for (const name of packages) {
    const dir = join(root, "packages", name);
    mkdirSync(dir, { recursive: true });
    const dependencies = name === "cli" ? { "@nodetool-ai/node-catalog": "1.2.3" } : {};
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: `@nodetool-ai/${name}`, version: "1.2.3", dependencies }));
  }
  const packs = ["core", "game"].map(id => ({
    id,
    npm: { name: `@nodetool-ai/${id}-nodes`, version: "1.2.3", integrity: "" },
    provides: id === "game" ? ["@nodetool-ai/game-renderer"] : [],
    installBytes: 0
  }));
  const data = join(root, "packages/node-catalog/data");
  mkdirSync(data, { recursive: true });
  writeFileSync(join(data, "index.json"), JSON.stringify({ coreVersion: "1.2.3", packs }));
  writeFileSync(join(data, "nodes.ndjson"), '{"type":"nodetool.core.test"}\n');
  return packages;
}

describe("release tarball reuse", () => {
  it.skipIf(process.platform !== "linux" || process.arch !== "x64")("packs each final public artifact once and excludes temporary measurement archives from publication", () => {
    const root = mkdtempSync(join(tmpdir(), "nodetool-publish-test-"));
    try {
      const packages = fixtureRepository(root);
      const npm = join(root, "npm");
      const log = join(root, "npm-calls.ndjson");
      writeFileSync(npm, `#!${process.execPath}
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const args = process.argv.slice(2);
const log = ${JSON.stringify(log)};
const record = fields => appendFileSync(log, JSON.stringify({ args, cwd: process.cwd(), ...fields }) + "\\n");
const integrity = file => "sha512-" + createHash("sha512").update(readFileSync(file)).digest("base64");
if (args[0] === "pack") {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  const staging = mkdtempSync(join(tmpdir(), "nodetool-fake-pack-"));
  mkdirSync(join(staging, "package"));
  writeFileSync(join(staging, "package", "package.json"), JSON.stringify(manifest));
  writeFileSync(join(staging, "package", "payload"), manifest.name);
  if (existsSync("dist/index.json")) {
    mkdirSync(join(staging, "package", "dist"));
    copyFileSync("dist/index.json", join(staging, "package", "dist", "index.json"));
  }
  const filename = manifest.name.replaceAll("/", "-").replace("@", "") + ".tgz";
  const dest = args[args.indexOf("--pack-destination") + 1];
  const file = join(dest, filename);
  const packed = spawnSync("tar", ["-czf", file, "-C", staging, "package"]);
  rmSync(staging, { recursive: true, force: true });
  if (packed.status !== 0) { process.exit(1); }
  record({ name: manifest.name, file, integrity: integrity(file) });
  console.log(JSON.stringify([{ filename }]));
} else if (args[0] === "install") {
  const isolated = process.env.PUBLISH_TEST_LOG === undefined && process.env.NPM_TOKEN === undefined && process.env.HOME === join(process.cwd(), "home");
  if (!isolated || !args.includes("--ignore-scripts") || !args.includes("--install-links") || !args.includes("--omit=dev")) { process.exit(1); }
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  const [name, target] = Object.entries(manifest.dependencies)[0];
  const runtime = manifest.name === "nodetool-release-runtime-measurement" && name === "typescript" && target === "npm:@typescript/typescript6@6.0.2";
  if (!runtime && (!target.startsWith("file:") || !existsSync(target.slice(5)))) { process.exit(1); }
  const tree = join(process.cwd(), "node_modules", name);
  mkdirSync(tree, { recursive: true });
  writeFileSync(join(tree, "payload"), "synthetic installed production payload");
  record({ name, isolated });
} else if (args[0] === "view") {
  if (!args.includes("--registry=https://registry.npmjs.org")) { process.exit(1); }
  const split = args[1].lastIndexOf("@");
  const name = args[1].slice(0, split);
  const version = args[1].slice(split + 1);
  record({ name, version });
  console.log(JSON.stringify({ name, version, "dist.integrity": "sha512-" + createHash("sha512").update(args[1]).digest("base64") }));
} else if (args[0] === "publish") {
  if (!args.includes("--dry-run") || args[args.indexOf("--tag") + 1] !== "staging" || !existsSync(args[1]) || !args[1].endsWith(".tgz")) { process.exit(1); }
  record({ file: args[1], integrity: integrity(args[1]) });
} else { process.exit(1); }
`);
      chmodSync(npm, 0o755);
      const env = { ...process.env, PATH: `${root}:${process.env.PATH}`, PUBLISH_TEST_LOG: log, NPM_TOKEN: "fixture-token-must-not-reach-measurement" };
      const script = join(root, "scripts/publish-packages.mjs");
      const artifacts = join(root, "artifacts");
      const run = (args) => spawnSync(process.execPath, [script, ...args], { env, encoding: "utf8" });
      const packed = run(["--pack-only", "--tarballs-dir", artifacts]);
      expect(packed.status, packed.stderr).toBe(0);
      const published = run(["--dry-run", "--tarballs-dir", artifacts]);
      expect(published.status, published.stderr).toBe(0);
      const calls = readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line));
      const packs = calls.filter((call) => call.args[0] === "pack" && dirname(call.file) === artifacts);
      const measurements = calls.filter((call) => call.args[0] === "pack" && dirname(call.file) !== artifacts);
      const installs = calls.filter((call) => call.args[0] === "install");
      const publishes = calls.filter((call) => call.args[0] === "publish");
      expect(packs).toHaveLength(packages.length);
      expect(measurements.map(call => call.name).sort()).toEqual(["@nodetool-ai/cli", "@nodetool-ai/node-catalog"]);
      expect(measurements.every(call => !existsSync(call.file) && call.args.includes("--ignore-scripts"))).toBe(true);
      expect(new Set(packs.map(call => call.name))).toEqual(new Set(packages.map(name => `@nodetool-ai/${name}`)));
      expect(installs).toHaveLength(3);
      expect(installs.every(call => call.isolated)).toBe(true);
      expect(new Set(installs.map(call => call.cwd)).size).toBe(installs.length);
      const lastInstall = calls.findLastIndex(call => call.args[0] === "install");
      expect(calls.slice(lastInstall + 1).filter(call => call.args[0] === "pack").map(call => call.name).sort()).toEqual(["@nodetool-ai/cli", "@nodetool-ai/node-catalog"]);
      expect(publishes).toHaveLength(packs.length);
      for (const publishedArtifact of publishes) {
        expect(dirname(publishedArtifact.file)).toBe(artifacts);
        expect(packs.find(call => call.file === publishedArtifact.file)?.integrity).toBe(publishedArtifact.integrity);
      }
      const firstInstall = calls.findIndex(call => call.args[0] === "install");
      expect(calls.slice(0, firstInstall).filter(call => call.args[0] === "pack").map(call => call.name).sort()).toEqual([
        "@nodetool-ai/core-nodes", "@nodetool-ai/game-nodes", "@nodetool-ai/game-renderer"
      ]);
      const catalogArtifact = packs.find(call => call.name === "@nodetool-ai/node-catalog");
      const extracted = spawnSync("tar", ["-xOf", catalogArtifact.file, "package/dist/index.json"], { encoding: "utf8" });
      expect(extracted.status, extracted.stderr).toBe(0);
      const pinned = JSON.parse(extracted.stdout);
      for (const pin of pinned.packs) {
        expect(pin.npm.integrity).toBe(packs.find(call => call.name === pin.npm.name).integrity);
        expect(pin.installBytes).toBeGreaterThan(0);
      }
      expect(pinned.installPins).toEqual(expect.arrayContaining([
        { name: "@nodetool-ai/game-renderer", version: "1.2.3", integrity: packs.find(call => call.name === "@nodetool-ai/game-renderer").integrity },
        { name: "@typescript/typescript6", installName: "typescript", version: "6.0.2", integrity: expect.stringMatching(/^sha512-/), installBytes: expect.any(Number) },
        { name: "mediabunny", version: "4.5.6", shared: true, integrity: expect.stringMatching(/^sha512-/) },
        { name: "@mediabunny/server", version: "4.5.6", shared: true, integrity: expect.stringMatching(/^sha512-/) }
      ]));
      expect(pinned.installPins).toHaveLength(4);
      expect(pinned.installPins.find(pin => pin.installName === "typescript").installBytes).toBeGreaterThan(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);
});
