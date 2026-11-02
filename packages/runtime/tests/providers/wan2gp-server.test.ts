import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { missingRuntimePackageOf } from "@nodetool-ai/protocol";
import { stopWan2GPServer, warmWan2GPServer, withWan2GPClient } from "../../src/providers/wan2gp-server.js";
import { Wan2GPProvider, resetWan2GPListings } from "../../src/providers/wan2gp-provider.js";
import { resetWan2GPFileStatus } from "../../src/providers/wan2gp-models.js";
import { FakeWan2GP } from "./wan2gp-fake-server.js";

/**
 * A stand-in for Wan2GP's interpreter. Run as `python wgp.py --mcp ...
 * --mcp-port N`, it logs its argv and cwd, answers a JSON-only GET with 406
 * like Wan2GP's MCP server, and speaks enough MCP for the client's handshake.
 */
const FAKE_WGP = `#!/usr/bin/env node
const http = require("node:http");
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[0].endsWith("nodetool_wan2gp.py")) {
  // NodeTool's helper: a catalog with one downloaded model and one missing.
  fs.appendFileSync(process.env.FAKE_WGP_LOG, JSON.stringify({ helper: args[1] }) + "\\n");
  const row = (model_type, status) => ({ model_type, name: model_type, main_output: ["video"], capabilities: ["text_to_video"], media_inputs: {}, status });
  fs.writeFileSync(args[2], JSON.stringify({ version: 1, models: [row("t2v_2_2", "available"), row("t2v_1_3B", "missing")] }));
  process.stdout.write(JSON.stringify({ type: "catalog", count: 2 }) + "\\n");
  process.exit(0);
}
fs.appendFileSync(process.env.FAKE_WGP_LOG, JSON.stringify({ cwd: process.cwd(), args, pythonpath: process.env.PYTHONPATH ?? null }) + "\\n");
const port = Number(args[args.indexOf("--mcp-port") + 1]);
http.createServer((req, res) => {
  if (req.method !== "POST") { res.writeHead(406, { "Content-Type": "application/json" }); res.end("{}"); return; }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const msg = JSON.parse(body);
    if (msg.id === undefined) { res.writeHead(202); res.end(); return; }
    const result = msg.method === "initialize"
      ? { protocolVersion: "2025-06-18", capabilities: {}, serverInfo: { name: "fake" } }
      : msg.method === "tools/list"
        ? { tools: [{ name: "wangp_session", inputSchema: { type: "object" } }] }
        : msg.params.name === "wangp_models"
          ? { structuredContent: { has_more: false, models: ["t2v_2_2", "t2v_1_3B"].map((model_type) => ({ model_type, name: model_type, main_output: ["video"], capabilities: ["text_to_video"], media_inputs: {} })) }, content: [] }
          : { structuredContent: { pid: process.pid }, content: [] };
    res.writeHead(200, { "Content-Type": "application/json", "Mcp-Session-Id": "s" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }));
  });
}).listen(port, "127.0.0.1");
`;

let root: string;
let saved: Record<string, string | undefined>;

async function install(): Promise<{ sourceDir: string; log: string }> {
  const installDir = join(root, "data", "nodetool", "wan2gp");
  const sourceDir = join(installDir, "616e60506aff", "Wan2GP");
  await mkdir(join(sourceDir, "env_uv", "bin"), { recursive: true });
  await writeFile(join(sourceDir, "wgp.py"), "# wgp\n");
  const python = join(sourceDir, "env_uv", "bin", "python");
  await writeFile(python, FAKE_WGP);
  await chmod(python, 0o755);
  await writeFile(
    join(installDir, "current.json"),
    JSON.stringify({ commit: "616e60506aff10086bbbde02a3bf4554c572adde", version: "v19.02", release: "616e60506aff" })
  );
  return { sourceDir, log: join(root, "wgp.log") };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "wan2gp-server-"));
  saved = {
    NODETOOL_HOST: process.env.NODETOOL_HOST,
    XDG_DATA_HOME: process.env.XDG_DATA_HOME,
    FAKE_WGP_LOG: process.env.FAKE_WGP_LOG,
    PYTHONPATH: process.env.PYTHONPATH
  };
  process.env.NODETOOL_HOST = "cli";
  process.env.XDG_DATA_HOME = join(root, "data");
  process.env.FAKE_WGP_LOG = join(root, "wgp.log");
});

afterEach(async () => {
  await stopWan2GPServer();
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await rm(root, { recursive: true, force: true });
});

describe.skipIf(process.platform === "win32")("managed Wan2GP server", () => {
  it("starts the installed Wan2GP on a loopback port and shares the process", async () => {
    const { sourceDir, log } = await install();
    process.env.PYTHONPATH = "/leaks";
    const first = await withWan2GPClient({}, (client) => client.callTool("wangp_session", {}));
    const second = await withWan2GPClient({ serverUrl: " " }, (client) => client.callTool("wangp_session", {}));
    expect(first).toEqual(second);
    const launches = (await readFile(log, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(launches).toHaveLength(1);
    expect(launches[0].cwd).toBe(sourceDir);
    expect(launches[0].pythonpath).toBeNull();
    expect(launches[0].args.slice(0, 8)).toEqual([
      "wgp.py",
      "--mcp",
      "--mcp-async",
      "--mcp-transport",
      "streamable-http",
      "--mcp-host",
      "127.0.0.1",
      "--mcp-port"
    ]);
  });

  it("restarts a server that stopped", async () => {
    const { log } = await install();
    await withWan2GPClient({}, async () => undefined);
    await stopWan2GPServer();
    await withWan2GPClient({}, async () => undefined);
    expect((await readFile(log, "utf8")).trim().split("\n")).toHaveLength(2);
  });

  it("uses a configured URL without starting the install", async () => {
    const { log } = await install();
    const fake = await new FakeWan2GP().start();
    try {
      await withWan2GPClient({ serverUrl: fake.url }, async () => undefined);
      expect(fake.methods[0]).toBe("initialize");
      await expect(readFile(log, "utf8")).rejects.toThrow();
    } finally {
      await fake.stop();
    }
  });

  it("reports the server's last output when it exits before it is ready", async () => {
    const { sourceDir } = await install();
    await writeFile(join(sourceDir, "env_uv", "bin", "python"), "#!/usr/bin/env bash\necho 'CUDA driver too old' >&2\nexit 4\n");
    await expect(withWan2GPClient({}, async () => undefined)).rejects.toThrow(/stopped before it was ready \(exit code 4\):\nCUDA driver too old/);
  });

  it("lists the installed Wan2GP's models with their download state", async () => {
    const { log } = await install();
    resetWan2GPListings();
    resetWan2GPFileStatus();
    const models = await new Wan2GPProvider({}).getAvailableVideoModels();
    expect(models.map((model) => [model.id, model.adapter])).toEqual([
      ["t2v_2_2", { state: "installed", artifactRef: { source: "huggingface", repoId: "wangp/t2v_2_2", modelType: "wangp.t2v_2_2" }, filesPresent: true }],
      ["t2v_1_3B", { state: "installed", artifactRef: { source: "huggingface", repoId: "wangp/t2v_1_3B", modelType: "wangp.t2v_1_3B" }, filesPresent: false }]
    ]);
    // An install without a catalog writes one. The server never starts for a listing.
    expect((await readFile(log, "utf8")).trim().split("\n")).toEqual([JSON.stringify({ helper: "catalog" })]);
    resetWan2GPFileStatus();
    await new Wan2GPProvider({}).getAvailableImageModels();
    expect((await readFile(log, "utf8")).trim().split("\n")).toHaveLength(1);
  });

  it("reads voices, languages and download state from a stored catalog without running Wan2GP", async () => {
    const { sourceDir, log } = await install();
    const tts = (model_type: string, status: string, model_modes?: { label: string; values: string[] }) => ({
      model_type,
      name: model_type,
      family: "tts",
      base_model_type: model_type,
      main_output: ["audio"],
      capabilities: ["text_to_audio"],
      media_inputs: { audio: ["prompt", "output"] },
      status,
      ...(model_modes && { model_modes })
    });
    await writeFile(
      join(sourceDir, "..", "catalog.json"),
      JSON.stringify({
        version: 1,
        models: [
          tts("qwen3_tts_customvoice", "available", { label: "Speaker", values: ["aiden", "vivian"] }),
          tts("index_tts25", "missing", { label: "Language", values: ["EN", "ZH"] }),
          tts("chatterbox", "partial")
        ]
      })
    );
    resetWan2GPFileStatus();
    const models = await new Wan2GPProvider({}).getAvailableTTSModels();
    expect(models.map((model) => [model.id, model.voices, model.languages, model.adapter?.filesPresent])).toEqual([
      ["qwen3_tts_customvoice", ["aiden", "vivian"], undefined, true],
      ["index_tts25", undefined, ["EN", "ZH"], false],
      ["chatterbox", undefined, undefined, false]
    ]);
    expect(models[0].capabilities).toContain("preset_voice");
    expect(models[1].capabilities).toContain("language_selection");
    await expect(readFile(log, "utf8")).rejects.toThrow(/ENOENT/);
  });

  it("starts the installed server ahead of a generation, which then uses it", async () => {
    await warmWan2GPServer();
    const { log } = await install();
    const starts = async (): Promise<number> =>
      (await readFile(log, "utf8")).split("\n").filter((line) => line.includes("--mcp")).length;
    await warmWan2GPServer();
    expect(await starts()).toBe(1);
    const pid = await withWan2GPClient({}, async (client) => client.callTool("wangp_session", { action: "get_job" }));
    expect(pid).toMatchObject({ pid: expect.any(Number) });
    expect(await starts()).toBe(1);
  });

  it("offers the install when nothing is installed and nothing answers", async () => {
    const error = await withWan2GPClient({}, async () => undefined).catch((caught: unknown) => caught);
    expect(missingRuntimePackageOf(error)).toBe("wan2gp");
    expect((error as Error).message).toMatch(/nodetool runtime add wan2gp/);
  });
});
