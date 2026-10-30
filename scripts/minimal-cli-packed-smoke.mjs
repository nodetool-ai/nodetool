import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout } from "node:timers/promises";

const executable = "./node_modules/.bin/nodetool";
const token = "packed-cli-token-0000000000000000000";
const fixturePath = resolve("cli-sdk-fixture.mjs");
writeFileSync(fixturePath, `
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname !== 'api.openai.com') { return originalFetch(input, init); }
  if (url.pathname.endsWith('/models')) { return new Response(JSON.stringify({object:'list',data:[{id:'fixture-model',object:'model',created:0,owned_by:'fixture'}]}),{headers:{'content-type':'application/json'}}); }
  const request = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
  const waiting = request.messages?.some(message => message.content === 'wait');
  const encoder = new TextEncoder();
  const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const body = new ReadableStream({ start(controller) {
    const send = value => controller.enqueue(encoder.encode('data: ' + JSON.stringify(value) + '\\n\\n'));
    send({id:'fixture',object:'chat.completion.chunk',created:0,model:'fixture',choices:[{index:0,delta:{content:'hello'},finish_reason:null}]});
    if (waiting) {
      process.stderr.write('Packed fixture streaming started\\n');
      const heartbeat = setInterval(() => {}, 1000);
      const abort = () => { clearInterval(heartbeat); controller.error(new DOMException('Cancelled','AbortError')); };
      if (signal?.aborted) { abort(); } else { signal?.addEventListener('abort',abort,{once:true}); }
    } else {
      send({id:'fixture',object:'chat.completion.chunk',created:0,model:'fixture',choices:[{index:0,delta:{content:' world'},finish_reason:null}]});
      send({id:'fixture',object:'chat.completion.chunk',created:0,model:'fixture',choices:[],usage:{prompt_tokens:1,completion_tokens:2,total_tokens:3}});
      controller.enqueue(encoder.encode('data: [DONE]\\n\\n')); controller.close();
    }
  }});
  return new Response(body,{headers:{'content-type':'text/event-stream'}});
};
`);
const inherited = Object.fromEntries(["PATH", "TMPDIR", "LANG", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SHARP_IGNORE_GLOBAL_LIBVIPS"].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
const environment = { ...inherited, XDG_DATA_HOME: resolve("xdg-data"), XDG_CONFIG_HOME: resolve("xdg-config"), XDG_CACHE_HOME: resolve("xdg-cache"), NODETOOL_DATA_DIR: resolve("cli-data"), NODETOOL_USER_ID: "packed-cli-user", SECRETS_MASTER_KEY: "k".repeat(32), NODETOOL_TOKENS: JSON.stringify({ [token]: "packed-cli-user" }), NODETOOL_API_TOKEN: token, NODE_OPTIONS: `--import=${pathToFileURL(fixturePath).href}` };
function start(args, options = {}) {
  const child = spawn(executable, args, { env: { ...environment, ...options.env }, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", data => { stdout += data; });
  child.stderr.on("data", data => { stderr += data; });
  const completed = new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (status, signal) => resolve({ status, signal, stdout, stderr })); });
  child.stdin.end(options.input ?? "");
  return { child, completed, output: () => stdout + stderr };
}
async function command(args, options = {}) {
  const running = start(args, options);
  const timeout = globalThis.setTimeout(() => running.child.kill("SIGKILL"), options.timeout ?? 20000);
  try {
    const result = await running.completed;
    if (!options.allowFailure) { assert.equal(result.status, 0, `${args.join(" ")}: ${result.stdout}\n${result.stderr}`); }
    return result;
  } finally { clearTimeout(timeout); }
}
function json(result) {
  const text = result.stdout.trim();
  try { return JSON.parse(text); } catch { /* Execution diagnostics may precede the final JSON result. */ }
  for (const match of text.matchAll(/^[\[{]/gm)) {
    try { return JSON.parse(text.slice(match.index)); } catch { /* Try the next complete JSON value. */ }
  }
  throw new Error(`CLI did not return JSON: ${text}`);
}
const manifestBefore = readFileSync("package.json", "utf8");
const lockBefore = readFileSync("package-lock.json", "utf8");
assert.match((await command(["--help"], { env: { SECRETS_MASTER_KEY: "", NODETOOL_USER_ID: "", NODETOOL_API_TOKEN: "", NODETOOL_TOKENS: "" } })).stdout, /workflows/);
assert.match((await command(["--version"])).stdout.trim(), /^\d+\.\d+\.\d+/);
assert.ok(json(await command(["providers", "list"])).some(provider => provider.id === "openai" && provider.installed));
assert.equal(json(await command(["providers", "info", "openai"])).id, "openai");
assert.match((await command(["packs", "--help"])).stdout, /install/);
const availablePacks = json(await command(["packs", "list", "--json"]));
assert.ok(availablePacks.some(pack => pack.id === "cli-full" && pack.installed === false));
const unavailable = await command(["chat"], { allowFailure: true });
assert.notEqual(unavailable.status, 0);
assert.match(unavailable.stderr + unavailable.stdout, /cli-full/);
assert.equal(existsSync("node_modules/@nodetool-ai/cli-full"), false);
for (const [action, flag] of [["run", "--json"], ["validate", "--warnings-as-errors"]]) {
  const missingDsl = await command([action, "not-installed-workflow.ts", flag], { allowFailure: true });
  assert.notEqual(missingDsl.status, 0);
  assert.match(missingDsl.stdout + missingDsl.stderr, /FEATURE_NOT_INSTALLED/);
  assert.match(missingDsl.stdout + missingDsl.stderr, /cli-full/);
  assert.ok(!(missingDsl.stdout + missingDsl.stderr).includes("ENOENT"));
}
const missingToken = await command(["workflows", "list"], { env: { NODETOOL_API_TOKEN: "" }, allowFailure: true });
assert.notEqual(missingToken.status, 0);
assert.match(missingToken.stderr, /token|NODETOOL_API_TOKEN/i);
const constantGraph = { nodes: [{ id: "value", type: "nodetool.constant.String", properties: { value: "packed constant" } }, { id: "out", type: "nodetool.output.Output", properties: { name: "result" } }], edges: [{ source: "value", sourceHandle: "output", target: "out", targetHandle: "value" }] };
writeFileSync("constant.json", JSON.stringify({ name: "CLI fixture", graph: constantGraph }));
assert.equal(json(await command(["validate", "constant.json"])).valid, true);
assert.deepEqual(json(await command(["run", "constant.json"])), { result: ["packed constant"] });
const missingOwner = await command(["run", "constant.json"], { env: { NODETOOL_USER_ID: "" }, allowFailure: true });
assert.notEqual(missingOwner.status, 0);
assert.match(missingOwner.stderr, /NODETOOL_USER_ID/);
const missingGraph = { nodes: [{ id: "code", type: "nodetool.code.Code", properties: { code: "preserve this" } }], edges: [] };
writeFileSync("missing.json", JSON.stringify(missingGraph));
const validation = await command(["validate", "missing.json"], { allowFailure: true });
assert.notEqual(validation.status, 0);
assert.match(validation.stdout + validation.stderr, /FEATURE_NOT_INSTALLED/);
assert.match(validation.stdout + validation.stderr, /code|sandbox/);
writeFileSync("missing-provider.json", JSON.stringify({ nodes: [{ id: "provider", type: "anthropic.text.ChatComplete", properties: { prompt: "preserve", model: "fixture" } }], edges: [] }));
const missingProvider = await command(["validate", "missing-provider.json"], { allowFailure: true });
assert.notEqual(missingProvider.status, 0);
assert.match(missingProvider.stdout + missingProvider.stderr, /FEATURE_NOT_INSTALLED/);
assert.match(missingProvider.stdout + missingProvider.stderr, /provider-anthropic/);
const server = start(["serve", "--host", "127.0.0.1", "--port", "0"]);
try {
  let address;
  for (let attempt = 0; attempt < 500; attempt++) {
    address = server.output().match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
    if (address) { break; }
    if (server.child.exitCode !== null) { throw new Error(server.output()); }
    await setTimeout(10);
  }
  assert.ok(address, server.output());
  environment.NODETOOL_API_URL = address;
  assert.equal((await fetch(address + "/health")).status, 200);
  assert.equal((await fetch(address + "/api/workflows")).status, 401);
  const created = json(await command(["workflows", "create", "constant.json"]));
  assert.match(created.id, /^[0-9a-f]{32}$/);
  assert.equal(json(await command(["workflows", "get", created.id.slice(0, 12)])).name, "CLI fixture");
  assert.ok(json(await command(["workflows", "list"])).workflows.some(row => row.id === created.id));
  writeFileSync("updated.json", JSON.stringify({ name: "CLI updated", graph: constantGraph }));
  assert.equal(json(await command(["workflows", "update", created.id, "updated.json"])).name, "CLI updated");
  await command(["secrets", "set", "OPENAI_API_KEY"], { input: "fixture-key\n" });
  assert.ok(!(await command(["secrets", "list"])).stdout.includes("fixture-key"));
  assert.equal((await command(["text", "hello", "--model", "fixture"])).stdout.trim(), "hello world");
  const models = json(await command(["models", "list", "--provider", "openai"]));
  assert.equal(models.provider, "openai");
  assert.ok(models.models.some(model => model.id === "fixture-model"));
  const otherProvider = await command(["models", "list", "--provider", "anthropic"], { allowFailure: true });
  assert.notEqual(otherProvider.status, 0);
  assert.match(otherProvider.stdout + otherProvider.stderr, /FEATURE_NOT_INSTALLED/);
  assert.match(otherProvider.stdout + otherProvider.stderr, /cli-full/);
  const remoteGraph = prompt => ({ nodes: [{ id: "remote", type: "openai.text.ChatComplete", properties: { model: "fixture", prompt } }, { id: "out", type: "nodetool.output.Output", properties: { name: "result" } }], edges: [{ source: "remote", sourceHandle: "output", target: "out", targetHandle: "value" }] });
  writeFileSync("remote.json", JSON.stringify(remoteGraph("hello")));
  assert.deepEqual(json(await command(["run", "remote.json"])), { result: ["hello world"] });
  writeFileSync("waiting.json", JSON.stringify({ name: "Cancel fixture", graph: remoteGraph("wait") }));
  const waiting = json(await command(["workflows", "create", "waiting.json"]));
  const run = json(await command(["workflows", "run", waiting.id]));
  await command(["jobs", "cancel", run.job_id]);
  let job;
  for (let attempt = 0; attempt < 20; attempt++) {
    job = json(await command(["jobs", "get", run.job_id]));
    if (job.status !== "running") { break; }
    await setTimeout(20);
  }
  assert.equal(job.status, "cancelled", JSON.stringify(job));
  const localCancelled = start(["run", "waiting.json"]);
  try {
    for (let attempt = 0; attempt < 300 && !localCancelled.output().includes("Packed fixture streaming started"); attempt++) { await setTimeout(10); }
    assert.match(localCancelled.output(), /Packed fixture streaming started/);
    localCancelled.child.kill("SIGINT");
    const localCancellation = await localCancelled.completed;
    assert.notEqual(localCancellation.status, 0, localCancelled.output());
    assert.equal(localCancellation.signal, null, localCancelled.output());
  } finally {
    if (localCancelled.child.exitCode === null) { localCancelled.child.kill("SIGKILL"); }
    await localCancelled.completed;
  }
  writeFileSync("asset.bin", Buffer.from([0, 255, 137, 80, 78, 71]));
  const asset = json(await command(["assets", "upload", "asset.bin"]));
  await command(["assets", "download", asset.id, "asset-copy.bin"]);
  assert.deepEqual(readFileSync("asset-copy.bin"), readFileSync("asset.bin"));
  await command(["assets", "delete", asset.id]);
  await command(["workflows", "delete", created.id]);
  const deleted = await command(["workflows", "get", created.id], { allowFailure: true });
  assert.notEqual(deleted.status, 0);
  assert.match(deleted.stderr, /404/);
} finally {
  server.child.kill("SIGTERM");
  const result = await server.completed;
  assert.equal(result.status, 0, server.output());
}
assert.equal(readFileSync("package.json", "utf8"), manifestBefore);
assert.equal(readFileSync("package-lock.json", "utf8"), lockBefore);
assert.equal(existsSync("node_modules/@nodetool-ai/cli-full"), false);
process.stdout.write("Packed default CLI help/version/packs, local execution, authenticated CRUD/serve, SDK streaming, cancellation, binary assets, missing features and no auto install passed\n");

const explicitPackIds = (process.env.NODETOOL_PACK_FIXTURE_IDS ?? "").split(",").filter(Boolean);
if (explicitPackIds.length) {
  const registry = process.env.NODETOOL_PACK_FIXTURE_REGISTRY;
  assert.ok(registry);
  const fixtures = JSON.parse(readFileSync(process.env.NODETOOL_PACK_FIXTURE_MANIFEST, "utf8"));
  const catalogFile = "node_modules/@nodetool-ai/pack-core/dist/index.json";
  const catalog = JSON.parse(readFileSync(catalogFile, "utf8"));
  for (const id of explicitPackIds) {
    const fixture = fixtures.find(entry => entry.manifest.name === `@nodetool-ai/${id}`);
    assert.ok(fixture, `No packed registry fixture for ${id}`);
    const original = catalog.packs.find(entry => entry.id === id);
    assert.ok(original?.kind === "cli-feature" && original.npm.name === fixture.manifest.name, `No admitted CLI feature catalog entry for ${id}`);
    const descriptor = { ...original, npm: { ...original.npm, version: fixture.manifest.version, integrity: fixture.integrity } };
    catalog.packs = [...catalog.packs.filter(entry => entry.id !== id), descriptor];
  }
  // This isolated registry models release metadata for unpublished local tarballs.
  writeFileSync(catalogFile, JSON.stringify(catalog));
  writeFileSync("cli-fixture.npmrc", "");
  const installation = await command(["packs", "add", ...explicitPackIds, "--yes"], { env: { npm_config_registry: registry, npm_config_userconfig: resolve("cli-fixture.npmrc"), NODE_OPTIONS: "" }, timeout: 240000 });
  process.stdout.write(installation.stdout + installation.stderr);
  assert.equal(existsSync("node_modules/@nodetool-ai/cli-full"), true);
  const rows = json(await command(["packs", "list", "--json"]));
  assert.ok(rows.some(row => row.id === "cli-full" && row.installed));
  const full = await command(["harness", "--help"], { env: { NODE_OPTIONS: "" } });
  assert.match(full.stdout, /harness/);
  assert.match(full.stdout, /gate|list/);
  assert.match((await command(["full", "harness", "--help"], { env: { NODE_OPTIONS: "" } })).stdout, /gate|list/);
  for (const [action, flag] of [["run", "--json"], ["validate", "--warnings-as-errors"]]) {
    const authored = await command([action, "not-installed-workflow.ts", flag], { env: { NODE_OPTIONS: "" }, allowFailure: true });
    assert.notEqual(authored.status, 0);
    assert.doesNotMatch(authored.stdout + authored.stderr, /unknown option|FEATURE_NOT_INSTALLED/);
    assert.match(authored.stdout + authored.stderr, /not-installed-workflow|not found|ENOENT/);
  }
  const filteredModels = json(await command(["models", "list", "--provider", "fal", "--json"], { env: { NODE_OPTIONS: "", NODETOOL_API_URL: "" }, timeout: 60000 }));
  assert.ok(Array.isArray(filteredModels));
  assert.ok(filteredModels.every(model => model.provider === "fal"));
  process.stdout.write("Packed explicit cli-full catalog installation and full command dispatch passed\n");
}
