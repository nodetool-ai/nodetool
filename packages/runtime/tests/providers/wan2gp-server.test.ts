import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { missingRuntimePackageOf } from "@nodetool-ai/protocol";
import { stopWan2GPServer, withWan2GPClient } from "../../src/providers/wan2gp-server.js";
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

  it("offers the install when nothing is installed and nothing answers", async () => {
    const error = await withWan2GPClient({}, async () => undefined).catch((caught: unknown) => caught);
    expect(missingRuntimePackageOf(error)).toBe("wan2gp");
    expect((error as Error).message).toMatch(/nodetool runtime add wan2gp/);
  });
});
