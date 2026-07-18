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
 * The bridge never refuses to start: when the NodeTool server is not
 * reachable it comes up in offline mode, exposing a single `nodetool_status`
 * tool that explains how to start the app, and keeps retrying in the
 * background. Once the server appears (or comes back after a restart) it
 * attaches and emits list_changed notifications so the client refreshes its
 * tool/resource/prompt lists.
 *
 * Env (wired from manifest.json user_config):
 *   NODETOOL_MCP_URL       endpoint URL, default http://127.0.0.1:7777/mcp
 *   NODETOOL_MCP_TOKEN     optional bearer token, sent as Authorization header
 *   NODETOOL_MCP_RETRY_MS  reconnect interval while offline, default 5000
 *
 * Stdout is the MCP protocol channel — all logging goes to stderr.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// __BRIDGE_VERSION__ is injected by esbuild `define` in scripts/build-mcpb.mjs.
/* global __BRIDGE_VERSION__ */
const BRIDGE_VERSION =
  typeof __BRIDGE_VERSION__ !== "undefined" ? __BRIDGE_VERSION__ : "dev";
const DEFAULT_URL = "http://127.0.0.1:7777/mcp";
const RETRY_MS = Number(process.env.NODETOOL_MCP_RETRY_MS) || 5000;

// Forwarded results are validated by the remote server; the bridge passes
// them through untouched.
const PassthroughResultSchema = z.object({}).passthrough();

// Workflow runs can be long; progress notifications reset the clock.
const FORWARD_REQUEST_OPTIONS = {
  timeout: 10 * 60 * 1000,
  resetTimeoutOnProgress: true
};

const STATUS_TOOL = {
  name: "nodetool_status",
  description:
    "Check whether the local NodeTool server is reachable. When NodeTool " +
    "is not running, returns instructions for starting it; once it is " +
    "running, the full NodeTool tool set becomes available.",
  inputSchema: { type: "object", properties: {} }
};

function log(message) {
  process.stderr.write(`[nodetool-mcpb] ${message}\n`);
}

/**
 * True for failures that mean "the server went away" (app quit, restart with
 * a fresh session store) as opposed to a real error from a live server.
 */
function isConnectionError(error) {
  if (error instanceof McpError) {
    return error.code === ErrorCode.ConnectionClosed;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /fetch failed|ECONNREFUSED|ECONNRESET|socket hang up|Not connected|terminated|Session not found|HTTP 404|HTTP 502|HTTP 503/i.test(
    message
  );
}

function offlineHelp(url) {
  return [
    `The NodeTool server is not reachable at ${url}.`,
    "",
    "To use NodeTool tools, start the server: open the NodeTool desktop",
    "app, or run `nodetool serve` in a terminal. This connector retries",
    `automatically every ${Math.round(RETRY_MS / 1000)}s and will pick the`,
    "server up as soon as it is running — no restart needed. Call the",
    "nodetool_status tool to re-check availability."
  ].join("\n");
}

async function main() {
  const url = process.env.NODETOOL_MCP_URL?.trim() || DEFAULT_URL;
  const token = process.env.NODETOOL_MCP_TOKEN?.trim();

  // Fixed capability superset: capabilities are declared once at initialize
  // and cannot change when the remote attaches later, so declare everything
  // the NodeTool server may offer.
  const server = new Server(
    { name: "nodetool", version: BRIDGE_VERSION },
    {
      capabilities: {
        tools: { listChanged: true },
        resources: { listChanged: true, subscribe: true },
        prompts: { listChanged: true },
        logging: {},
        completions: {}
      },
      instructions:
        "Bridge to a local NodeTool server (workflows, assets, nodes, jobs, " +
        "agent tools). If only the nodetool_status tool is listed, the " +
        "NodeTool app is not running — call it for startup instructions."
    }
  );

  /** Connected Client, or null while offline. */
  let remote = null;
  let connecting = null;
  let retryTimer = null;

  const notifyListsChanged = () => {
    for (const method of [
      "notifications/tools/list_changed",
      "notifications/resources/list_changed",
      "notifications/prompts/list_changed"
    ]) {
      void server.notification({ method }).catch(() => {
        // stdio client not connected yet (startup) — it will list fresh anyway.
      });
    }
  };

  const scheduleRetry = () => {
    if (retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void ensureRemote().then((c) => {
        if (!c) scheduleRetry();
      });
    }, RETRY_MS);
    // Don't hold the process open just to retry — stdio keeps it alive.
    retryTimer.unref?.();
  };

  const tryConnect = async () => {
    const client = new Client(
      { name: "nodetool-mcpb-bridge", version: BRIDGE_VERSION },
      { capabilities: {} }
    );
    const transportOptions = token
      ? { requestInit: { headers: { Authorization: `Bearer ${token}` } } }
      : {};
    await client.connect(
      new StreamableHTTPClientTransport(new URL(url), transportOptions)
    );

    // Remote-to-client notifications (tools/list_changed, logging, ...).
    client.fallbackNotificationHandler = async (notification) => {
      try {
        await server.notification(notification);
      } catch {
        // Not connected yet or already closed — nothing to relay to.
      }
    };
    client.onerror = (error) =>
      log(
        `remote transport error: ${error instanceof Error ? error.message : String(error)}`
      );
    client.onclose = () => dropRemote(client);
    return client;
  };

  /** Detach a dead client and go back to offline mode. */
  const dropRemote = (client) => {
    if (remote !== client) return false;
    remote = null;
    void client.close().catch(() => {});
    log("NodeTool server connection lost — switching to offline mode.");
    notifyListsChanged();
    scheduleRetry();
    return true;
  };

  /** Return the connected client, attempting one (deduped) connect if offline. */
  const ensureRemote = async () => {
    if (remote) return remote;
    if (!connecting) {
      connecting = tryConnect()
        .then((client) => {
          remote = client;
          const info = client.getServerVersion();
          log(
            `connected to NodeTool server at ${url}` +
              (info ? ` (${info.name} ${info.version})` : "")
          );
          notifyListsChanged();
          return client;
        })
        .catch((error) => {
          log(
            `NodeTool server not reachable at ${url}: ${error instanceof Error ? error.message : String(error)}`
          );
          return null;
        })
        .finally(() => {
          connecting = null;
        });
    }
    return connecting;
  };

  const statusResult = () => {
    const info = remote?.getServerVersion();
    const text = remote
      ? `NodeTool server is running at ${url}` +
        (info ? ` (${info.name} ${info.version})` : "") +
        ". All NodeTool tools are available."
      : offlineHelp(url);
    return { content: [{ type: "text", text }] };
  };

  // Forward every request the Server has no built-in handler for (i.e.
  // everything except the initialize handshake). While offline, answer list
  // requests with a minimal surface instead of erroring so the client stays
  // healthy.
  const offlineResult = (method) => {
    scheduleRetry();
    switch (method) {
      case "tools/list":
        return { tools: [STATUS_TOOL] };
      case "prompts/list":
        return { prompts: [] };
      case "resources/list":
        return { resources: [] };
      case "resources/templates/list":
        return { resourceTemplates: [] };
      case "tools/call":
        return {
          isError: true,
          content: [{ type: "text", text: offlineHelp(url) }]
        };
      default:
        throw new McpError(ErrorCode.InternalError, offlineHelp(url));
    }
  };

  server.fallbackRequestHandler = async (request) => {
    const method = request.method;
    if (method === "tools/call" && request.params?.name === STATUS_TOOL.name) {
      // Actively verify the connection — a quit app doesn't always close the
      // HTTP session, so trust a ping, not the cached client.
      const client = await ensureRemote();
      if (client) {
        try {
          await client.ping();
        } catch (error) {
          if (isConnectionError(error)) dropRemote(client);
        }
      }
      return statusResult();
    }

    const client = await ensureRemote();
    if (client) {
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
              // stdio client went away mid-run; the close handler exits.
            });
        };
      }
      try {
        const result = await client.request(
          request,
          PassthroughResultSchema,
          options
        );
        if (method === "tools/list") {
          result.tools = [...(result.tools ?? []), STATUS_TOOL];
        }
        return result;
      } catch (error) {
        // The server died mid-session (app quit/restart). Fall back to the
        // offline surface instead of surfacing raw fetch errors; real errors
        // from a live server propagate unchanged.
        if (isConnectionError(error) && dropRemote(client)) {
          return offlineResult(method);
        }
        throw error;
      }
    }

    return offlineResult(method);
  };

  // Client-to-remote notifications the Server core doesn't consume itself.
  server.fallbackNotificationHandler = async (notification) => {
    try {
      await remote?.notification(notification);
    } catch {
      // Remote session gone; the onclose handler flips to offline mode.
    }
  };

  // First connect attempt before serving, so a running server is bridged
  // from the very first request; an offline server just means offline mode.
  await ensureRemote();

  await server.connect(new StdioServerTransport());
  // connect() installs the Protocol's own transport.onclose, so hook the
  // Protocol-level callback (set after connect) rather than the transport's.
  server.onclose = () => {
    log("stdio client disconnected — shutting down.");
    const client = remote;
    remote = null; // keep dropRemote from re-entering offline mode mid-exit
    void client?.close().catch(() => {});
    process.exit(0);
  };

  log(
    remote
      ? `bridging stdio <-> ${url}`
      : `serving in offline mode; retrying ${url} every ${Math.round(RETRY_MS / 1000)}s`
  );
}

main().catch((error) => {
  log(
    `fatal: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`
  );
  process.exit(1);
});
