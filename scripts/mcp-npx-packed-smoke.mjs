import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startPackedRegistry } from "./packed-registry.mjs";

// Use original tarballs and normal npm resolution, never monorepo workspace links.
const root = resolve(import.meta.dirname, "..");
const output = mkdtempSync(join(tmpdir(), "nodetool-mcp-npx-"));
const consumer = join(output, "consumer");
const home = join(output, "home");
const tarballs = join(output, "tarballs");
for (const path of [consumer, home, tarballs]) { mkdirSync(path); }
const workspaces = new Map(JSON.parse(readFileSync(join(root, "package.json"))).workspaces.map(path => {
  const manifest = JSON.parse(readFileSync(join(root, path, "package.json")));
  return [manifest.name, { path: join(root, path), manifest }];
}));
const artifacts = {};
function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8", timeout: 600000, maxBuffer: 32 * 1024 * 1024 });
  assert.equal(result.status, 0, `${command} ${args.join(" ")}\n${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
function pack(name) {
  if (artifacts[name]) { return; }
  const { path, manifest } = workspaces.get(name);
  const [result] = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", tarballs], path));
  artifacts[name] = join(tarballs, result.filename);
  for (const dependency of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies, ...manifest.peerDependencies })) {
    if (workspaces.has(dependency)) { pack(dependency); }
  }
}
assert.deepEqual(Object.keys(workspaces.get("@nodetool-ai/cli-mcp").manifest.bin), ["nodetool-mcp"]);
pack("@nodetool-ai/cli-mcp");
writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "mcp-npx-consumer", private: true }));
const registry = await startPackedRegistry(artifacts);
try {
  const env = { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, ".config"), NODE_PATH: "", NODE_OPTIONS: "", npm_config_registry: registry.url, npm_config_cache: join(output, "cache"), npm_config_userconfig: join(home, ".npmrc") };
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const invoke = (...args) => run(npx, ["-y", "@nodetool-ai/cli-mcp", ...args], consumer, env);
  assert.match(invoke("install", "--help"), /--no-verify/);
  invoke("install", "--claude", "--npx", "--no-verify");
  const config = JSON.parse(readFileSync(join(home, ".claude.json")));
  assert.deepEqual(config.mcpServers.nodetool, { type: "stdio", command: "npx", args: ["-y", "@nodetool-ai/cli-mcp", "serve"], env: {} });
  assert.match(invoke("status"), /nodetool|Claude/i);
  invoke("uninstall", "--claude");
  assert.equal(JSON.parse(readFileSync(join(home, ".claude.json"))).mcpServers?.nodetool, undefined);
  process.stdout.write(`Short npx install/status/uninstall passed with ${Object.keys(artifacts).length} packed artifacts. Evidence: ${output}\n`);
} finally { await registry.close(); }
