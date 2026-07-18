/**
 * Build the NodeTool MCP bundle (.mcpb) for Claude Desktop and other
 * MCPB-aware agents.
 *
 * The bundle is a thin stdio <-> streamable-HTTP bridge (scripts/mcpb/
 * bridge.mjs) esbuild-bundled into a single dependency-free file, plus an
 * MCPB 0.3 manifest. It connects to a running NodeTool server's /mcp
 * endpoint — the bundle itself ships no native modules and no database, so
 * one .mcpb works on every platform.
 *
 * Usage:
 *   node scripts/build-mcpb.mjs [--out <file>] [--smoke]
 *
 * Produces (default): dist/nodetool.mcpb
 * Staging dir:        dist/mcpb/ (manifest.json, server/index.mjs, icon.png)
 *
 * --smoke runs two end-to-end checks against the bundled bridge over stdio:
 * online (initialize + tools/list + tools/call round-trips through a minimal
 * in-process streamable-HTTP MCP server) and offline recovery (bridge starts
 * with no server, serves the nodetool_status fallback tool, then picks the
 * server up once it appears).
 */

import esbuild from "esbuild";
import fs from "fs";
import fsp from "fs/promises";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const ENTRY = path.join(__dirname, "mcpb", "bridge.mjs");
const STAGING_DIR = path.join(ROOT_DIR, "dist", "mcpb");
const ICON_SOURCE = path.join(ROOT_DIR, "web", "public", "logo192.png");

function parseArgs(argv) {
  const opts = {
    out: path.join(ROOT_DIR, "dist", "nodetool.mcpb"),
    smoke: false
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out") {
      const value = argv[++i];
      if (!value || value.startsWith("--")) {
        throw new Error("--out requires a file argument");
      }
      opts.out = path.resolve(value);
    } else if (arg === "--smoke") {
      opts.smoke = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

/** App version — the electron package carries the product version. */
function readVersion() {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, "electron", "package.json"), "utf8")
  );
  return pkg.version;
}

function buildManifest(version) {
  return {
    manifest_version: "0.3",
    name: "nodetool",
    display_name: "NodeTool",
    version,
    description:
      "Run NodeTool workflows, browse assets, search nodes, and manage jobs from your agent.",
    long_description:
      "Connects Claude (or any MCPB-aware agent) to your local NodeTool " +
      "server over MCP. Exposes workflow execution and validation, asset " +
      "and collection browsing, node search, job management, and agent " +
      "tools. Requires a running NodeTool app or `nodetool serve`.",
    author: { name: "NodeTool", url: "https://nodetool.ai" },
    homepage: "https://nodetool.ai",
    documentation: "https://github.com/nodetool-ai/nodetool",
    repository: { type: "git", url: "https://github.com/nodetool-ai/nodetool" },
    license: "AGPL-3.0",
    icon: "icon.png",
    keywords: ["nodetool", "workflows", "agents", "ai", "automation"],
    server: {
      type: "node",
      entry_point: "server/index.mjs",
      mcp_config: {
        command: "node",
        args: ["${__dirname}/server/index.mjs"],
        env: {
          NODETOOL_MCP_URL: "${user_config.server_url}",
          NODETOOL_MCP_TOKEN: "${user_config.auth_token}"
        }
      }
    },
    user_config: {
      server_url: {
        type: "string",
        title: "NodeTool server URL",
        description:
          "The /mcp endpoint of your running NodeTool server. The default " +
          "matches the desktop app and `nodetool serve`.",
        default: "http://127.0.0.1:7777/mcp",
        required: true
      },
      auth_token: {
        type: "string",
        title: "Auth token (optional)",
        description:
          "Bearer token sent as the Authorization header. Leave empty for a " +
          "local server.",
        sensitive: true,
        required: false
      }
    },
    compatibility: {
      platforms: ["darwin", "win32", "linux"],
      runtimes: { node: ">=18.0.0" }
    }
  };
}

async function bundleBridge(version) {
  const outfile = path.join(STAGING_DIR, "server", "index.mjs");
  await esbuild.build({
    entryPoints: [ENTRY],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node18",
    banner: {
      // createRequire shim: some SDK deps probe optional requires.
      js: [
        'import { createRequire as __mcpbCreateRequire } from "module";',
        "const require = __mcpbCreateRequire(import.meta.url);"
      ].join("\n")
    },
    define: {
      __BRIDGE_VERSION__: JSON.stringify(version),
      "process.env.NODE_ENV": '"production"'
    },
    minify: false,
    sourcemap: false,
    logLevel: "warning"
  });
  return outfile;
}

async function stage(version) {
  await fsp.rm(STAGING_DIR, { recursive: true, force: true });
  await fsp.mkdir(path.join(STAGING_DIR, "server"), { recursive: true });

  const bridgePath = await bundleBridge(version);
  await fsp.writeFile(
    path.join(STAGING_DIR, "manifest.json"),
    JSON.stringify(buildManifest(version), null, 2) + "\n"
  );
  await fsp.copyFile(ICON_SOURCE, path.join(STAGING_DIR, "icon.png"));
  return bridgePath;
}

async function pack(outFile) {
  await fsp.mkdir(path.dirname(outFile), { recursive: true });
  await fsp.rm(outFile, { force: true });
  const AdmZip = require("adm-zip");
  const zip = new AdmZip();
  zip.addLocalFolder(STAGING_DIR);
  zip.writeZip(outFile);
}

// ---------------------------------------------------------------------------
// Smoke test: fake remote MCP server + bundled bridge over stdio
// ---------------------------------------------------------------------------

/** Start a minimal stateful streamable-HTTP MCP server; 0 = random port. */
async function startFakeRemote(port = 0) {
  const { McpServer } = await import(
    "@modelcontextprotocol/sdk/server/mcp.js"
  );
  const { WebStandardStreamableHTTPServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
  );
  const { z } = await import("zod");
  const http = await import("http");

  const sessions = new Map();
  const makeServer = () => {
    const remote = new McpServer({ name: "smoke-remote", version: "1.0.0" });
    remote.registerTool(
      "echo",
      {
        description: "Echo back the input",
        inputSchema: { text: z.string() }
      },
      async ({ text }) => ({ content: [{ type: "text", text }] })
    );
    return remote;
  };

  const httpServer = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const request = new Request(`http://127.0.0.1${req.url}`, {
      method: req.method,
      headers: req.headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : body
    });

    const sessionId = req.headers["mcp-session-id"];
    let transport = sessionId ? sessions.get(sessionId) : undefined;
    if (!transport) {
      transport = new WebStandardStreamableHTTPServerTransport({
        enableJsonResponse: true,
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (id) => sessions.set(id, transport)
      });
      await makeServer().connect(transport);
    }
    const response = await transport.handleRequest(request);
    res.writeHead(
      response.status,
      Object.fromEntries(response.headers.entries())
    );
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, "127.0.0.1", resolve);
  });
  return {
    port: httpServer.address().port,
    close: () =>
      new Promise((resolve) => {
        httpServer.close(resolve);
        // Sever open SSE streams from the bridge, or close() never resolves.
        httpServer.closeAllConnections();
      })
  };
}

/** Launch the bundled bridge over stdio and hand a connected Client to fn. */
async function withBridgeClient(bridgePath, port, fn) {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import(
    "@modelcontextprotocol/sdk/client/stdio.js"
  );

  const client = new Client({ name: "smoke-client", version: "1.0.0" });
  const stdio = new StdioClientTransport({
    command: process.execPath,
    args: [bridgePath],
    env: {
      ...process.env,
      NODETOOL_MCP_URL: `http://127.0.0.1:${port}/mcp`,
      NODETOOL_MCP_RETRY_MS: "200"
    },
    stderr: "pipe"
  });
  const stderrChunks = [];
  try {
    const connectPromise = client.connect(stdio);
    stdio.stderr?.on("data", (c) => stderrChunks.push(c));
    await connectPromise;
    await fn(client);
  } catch (error) {
    const stderr = Buffer.concat(stderrChunks).toString();
    if (stderr) console.error(`bridge stderr:\n${stderr}`);
    throw error;
  } finally {
    await client.close().catch(() => {});
  }
}

async function smokeTestOnline(bridgePath) {
  const remote = await startFakeRemote();
  try {
    await withBridgeClient(bridgePath, remote.port, async (client) => {
      const tools = await client.listTools();
      const names = tools.tools.map((t) => t.name);
      if (!names.includes("echo") || !names.includes("nodetool_status")) {
        throw new Error(`bridge did not relay tools, got: ${names.join(", ")}`);
      }
      const result = await client.callTool({
        name: "echo",
        arguments: { text: "mcpb-smoke-ok" }
      });
      const text = result.content?.[0]?.text;
      if (text !== "mcpb-smoke-ok") {
        throw new Error(
          `tool call round-trip failed, got: ${JSON.stringify(result)}`
        );
      }
    });
  } finally {
    await remote.close();
  }
}

async function smokeTestOfflineRecovery(bridgePath) {
  // Reserve a free port, then release it so the bridge starts against a
  // closed port and the fake remote can claim it later.
  const probe = await startFakeRemote();
  const port = probe.port;
  await probe.close();

  let remote = null;
  try {
    await withBridgeClient(bridgePath, port, async (client) => {
      // Offline: only the status fallback tool, and it explains how to start.
      const offlineTools = await client.listTools();
      const offlineNames = offlineTools.tools.map((t) => t.name);
      if (offlineNames.join(",") !== "nodetool_status") {
        throw new Error(
          `expected only nodetool_status while offline, got: ${offlineNames.join(", ")}`
        );
      }
      const status = await client.callTool({ name: "nodetool_status" });
      if (!status.content?.[0]?.text?.includes("not reachable")) {
        throw new Error(
          `offline status text unexpected: ${JSON.stringify(status)}`
        );
      }

      // Server appears: the bridge must pick it up and expose its tools.
      remote = await startFakeRemote(port);
      const deadline = Date.now() + 10_000;
      for (;;) {
        const { tools } = await client.listTools();
        if (tools.some((t) => t.name === "echo")) break;
        if (Date.now() > deadline) {
          throw new Error(
            `bridge did not attach to the server that appeared on port ${port}`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const result = await client.callTool({
        name: "echo",
        arguments: { text: "recovered" }
      });
      if (result.content?.[0]?.text !== "recovered") {
        throw new Error(
          `tool call after recovery failed, got: ${JSON.stringify(result)}`
        );
      }

      // Server dies mid-session: calls must degrade to the offline surface,
      // not raw fetch errors, and status must report unreachable again.
      await remote.close();
      remote = null;
      const dead = await client.callTool({
        name: "echo",
        arguments: { text: "x" }
      });
      if (!dead.isError || !dead.content?.[0]?.text?.includes("not reachable")) {
        throw new Error(
          `expected offline fallback after server death, got: ${JSON.stringify(dead)}`
        );
      }
      const statusAfter = await client.callTool({ name: "nodetool_status" });
      if (!statusAfter.content?.[0]?.text?.includes("not reachable")) {
        throw new Error(
          `status did not detect dead server: ${JSON.stringify(statusAfter)}`
        );
      }
    });
  } finally {
    await remote?.close();
  }
}

// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv);
  const version = readVersion();

  console.log(`Building NodeTool MCP bundle v${version} ...`);
  const bridgePath = await stage(version);
  const { size } = await fsp.stat(bridgePath);
  console.log(
    `  bundled bridge: ${path.relative(ROOT_DIR, bridgePath)} (${(size / 1024).toFixed(0)} KB)`
  );

  if (opts.smoke) {
    console.log("  smoke test: online round-trip ...");
    await smokeTestOnline(bridgePath);
    console.log("  smoke test: offline fallback + recovery ...");
    await smokeTestOfflineRecovery(bridgePath);
    console.log("  smoke tests passed.");
  }

  await pack(opts.out);
  const packed = await fsp.stat(opts.out);
  console.log(
    `Wrote ${path.relative(ROOT_DIR, opts.out)} (${(packed.size / 1024).toFixed(0)} KB)`
  );
  console.log(
    "Install: drag the .mcpb into Claude Desktop (Settings > Extensions), " +
      "with NodeTool running on http://127.0.0.1:7777."
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
