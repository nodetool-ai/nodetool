/**
 * Stdio ↔ Streamable-HTTP bridge for the NodeTool MCP bundle (.mcpb).
 *
 * Claude Desktop (and any stdio-only MCP client) launches this file; it
 * connects to a running NodeTool server's /mcp endpoint and forwards every
 * request, response, and notification in both directions. Keeping the bundle
 * a thin bridge means no native modules and no database inside the .mcpb —
 * the real MCP server (workflows, assets, nodes, jobs, agent tools) lives in
 * the NodeTool app the user already runs.
 *
 * Env (wired from manifest.json user_config):
 *   NODETOOL_MCP_URL    endpoint URL, default http://127.0.0.1:7777/mcp
 *   NODETOOL_MCP_TOKEN  optional bearer token, sent as Authorization header
 *
 * Stdout is the MCP protocol channel — all logging goes to stderr.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// __BRIDGE_VERSION__ is injected by esbuild `define` in scripts/build-mcpb.mjs.
/* global __BRIDGE_VERSION__ */
const BRIDGE_VERSION =
  typeof __BRIDGE_VERSION__ !== "undefined" ? __BRIDGE_VERSION__ : "dev";
const DEFAULT_URL = "http://127.0.0.1:7777/mcp";

// Forwarded results are validated by the remote server; the bridge passes
// them through untouched.
const PassthroughResultSchema = z.object({}).passthrough();

// Workflow runs can be long; progress notifications reset the clock.
const FORWARD_REQUEST_OPTIONS = {
  timeout: 10 * 60 * 1000,
  resetTimeoutOnProgress: true
};

function log(message) {
  process.stderr.write(`[nodetool-mcpb] ${message}\n`);
}

function connectionHelp(url, cause) {
  return [
    `Could not reach the NodeTool MCP endpoint at ${url}.`,
    `Cause: ${cause}`,
    "",
    "Make sure NodeTool is running. Either:",
    "  - open the NodeTool desktop app, or",
    "  - start a server with: nodetool serve",
    "then reconnect this MCP server (in Claude Desktop: Settings >",
    "Extensions > NodeTool, or restart the conversation)."
  ].join("\n");
}

async function main() {
  const url = process.env.NODETOOL_MCP_URL?.trim() || DEFAULT_URL;
  const token = process.env.NODETOOL_MCP_TOKEN?.trim();

  const client = new Client(
    { name: "nodetool-mcpb-bridge", version: BRIDGE_VERSION },
    { capabilities: {} }
  );

  const transportOptions = token
    ? { requestInit: { headers: { Authorization: `Bearer ${token}` } } }
    : {};
  const httpTransport = new StreamableHTTPClientTransport(
    new URL(url),
    transportOptions
  );

  try {
    await client.connect(httpTransport);
  } catch (error) {
    log(connectionHelp(url, error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }

  const remoteInfo = client.getServerVersion() ?? {
    name: "nodetool",
    version: BRIDGE_VERSION
  };
  const remoteCapabilities = client.getServerCapabilities() ?? {};
  const instructions = client.getInstructions();

  const server = new Server(remoteInfo, {
    capabilities: remoteCapabilities,
    ...(instructions ? { instructions } : {})
  });

  // Forward every request the Server has no built-in handler for (i.e.
  // everything except the initialize handshake) to the remote endpoint,
  // relaying progress back to the caller when it asked for it.
  server.fallbackRequestHandler = async (request) => {
    const progressToken = request.params?._meta?.progressToken;
    const options = { ...FORWARD_REQUEST_OPTIONS };
    if (progressToken !== undefined) {
      options.onprogress = (progress) => {
        void server
          .notification({
            method: "notifications/progress",
            params: { ...progress, progressToken }
          })
          .catch(() => {
            // The stdio client went away mid-run; the close handler exits.
          });
      };
    }
    return client.request(request, PassthroughResultSchema, options);
  };

  // Remote-to-client notifications (tools/list_changed, logging, ...).
  client.fallbackNotificationHandler = async (notification) => {
    try {
      await server.notification(notification);
    } catch {
      // Not connected yet or already closed — nothing to relay to.
    }
  };

  // Client-to-remote notifications the Server core doesn't consume itself.
  server.fallbackNotificationHandler = async (notification) => {
    try {
      await client.notification(notification);
    } catch {
      // Remote session gone; the close handler exits.
    }
  };

  let shuttingDown = false;
  const shutdown = (reason, code) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`${reason} — shutting down.`);
    void client.close().catch(() => {});
    void server.close().catch(() => {});
    process.exit(code);
  };

  // connect() installs the Protocol's own transport.onclose/onerror, so hook
  // the Protocol-level callbacks (set after connect) rather than the transport.
  client.onclose = () => shutdown("NodeTool server closed the connection", 1);
  client.onerror = (error) =>
    log(`transport error: ${error instanceof Error ? error.message : String(error)}`);

  await server.connect(new StdioServerTransport());
  server.onclose = () => shutdown("stdio client disconnected", 0);

  log(
    `bridging stdio <-> ${url} (remote: ${remoteInfo.name} ${remoteInfo.version})`
  );
}

main().catch((error) => {
  log(`fatal: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  process.exit(1);
});
