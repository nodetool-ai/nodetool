/**
 * Mock HTTP API server for documentation screenshot capture (legacy).
 *
 * NOTE: This mock server is no longer used by the screenshot automation.
 * The real NodeTool backend is now started instead — see:
 *   packages/websocket/src/screenshot-server.ts  (the backend entry point)
 *   web/tests/globalSetup.ts                     (spawns the backend)
 *
 * This file is kept for reference. It may be useful for lightweight local
 * testing that does not require the full backend stack to be built.
 *
 * Legacy usage (no longer active):
 *   const { startMockServer } = await import('./mockServer');
 *   const server = await startMockServer(4444);
 *   // ... run tests ...
 *   await server.close();
 *
 *   PROXY_API_TARGET=http://localhost:4444 npm start
 */

import * as http from "http";
import {
  MOCK_NODE_METADATA,
  MOCK_WORKFLOWS,
  MOCK_TEMPLATES,
  MOCK_MODELS,
  MOCK_ASSETS,
  MOCK_THREADS,
  MOCK_MESSAGES,
  MOCK_SECRETS,
  MOCK_LANGUAGE_MODELS
} from "./mockData.js";

type Handler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  match: RegExpMatchArray | null
) => void;

interface Route {
  method: string | null; // null = any method
  pattern: RegExp;
  handler: Handler;
}

const routes: Route[] = [];

function add(
  method: string | null,
  pattern: RegExp,
  handler: Handler
): void {
  routes.push({ method, pattern, handler });
}

function sendJson(
  res: http.ServerResponse,
  data: unknown,
  status = 200
): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  res.end(body);
}

function sendEmpty(res: http.ServerResponse, status = 204): void {
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  res.end();
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Node metadata (required for app to boot)
add("GET", /^\/api\/nodes\/metadata$/, (_req, res) => {
  sendJson(res, MOCK_NODE_METADATA);
});

// Workflow examples / templates
add("GET", /^\/api\/workflows\/examples(\?.*)?$/, (_req, res) => {
  sendJson(res, { next: null, workflows: MOCK_TEMPLATES });
});

// Workflow tools
add("GET", /^\/api\/workflows\/tools(\?.*)?$/, (_req, res) => {
  sendJson(res, { next: null, workflows: [] });
});

// Workflow collection (list + create)
add("GET", /^\/api\/workflows\/(\?.*)?$/, (_req, res) => {
  sendJson(res, { next: null, workflows: MOCK_WORKFLOWS });
});

add("POST", /^\/api\/workflows\/(\?.*)?$/, (req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(body);
    } catch {
      // ignore
    }
    sendJson(res, {
      ...MOCK_WORKFLOWS[0],
      id: `wf-new-${Date.now()}`,
      name: (parsed.name as string) ?? "New Workflow",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  });
});

// Individual workflow
add("GET", /^\/api\/workflows\/([^/?]+)(\?.*)?$/, (_req, res) => {
  sendJson(res, MOCK_WORKFLOWS[0]);
});

add("PUT", /^\/api\/workflows\/([^/?]+)(\?.*)?$/, (req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(body);
    } catch {
      // ignore
    }
    sendJson(res, { ...MOCK_WORKFLOWS[0], ...parsed });
  });
});

add("DELETE", /^\/api\/workflows\/([^/?]+)(\?.*)?$/, (_req, res) => {
  sendEmpty(res);
});

// Assets
add("GET", /^\/api\/assets\/(\?.*)?$/, (_req, res) => {
  sendJson(res, { next: null, assets: MOCK_ASSETS });
});

add("GET", /^\/api\/assets\/([^/?]+)(\?.*)?$/, (_req, res) => {
  sendJson(res, MOCK_ASSETS[0]);
});

add("DELETE", /^\/api\/assets\/([^/?]+)(\?.*)?$/, (_req, res) => {
  sendEmpty(res);
});

// Chat threads
add("GET", /^\/api\/threads\/(\?.*)?$/, (_req, res) => {
  sendJson(res, { next: null, threads: MOCK_THREADS });
});

add("POST", /^\/api\/threads\/(\?.*)?$/, (_req, res) => {
  sendJson(res, MOCK_THREADS[0]);
});

add("GET", /^\/api\/threads\/([^/?]+)(\?.*)?$/, (_req, res) => {
  sendJson(res, MOCK_THREADS[0]);
});

add("PUT", /^\/api\/threads\/([^/?]+)(\?.*)?$/, (_req, res) => {
  sendJson(res, MOCK_THREADS[0]);
});

add("DELETE", /^\/api\/threads\/([^/?]+)(\?.*)?$/, (_req, res) => {
  sendEmpty(res);
});

// Messages
add("GET", /^\/api\/messages\/(\?.*)?$/, (_req, res) => {
  sendJson(res, { next: null, messages: MOCK_MESSAGES });
});

add("POST", /^\/api\/messages\/(\?.*)?$/, (_req, res) => {
  sendJson(res, MOCK_MESSAGES[0]);
});

// Models
add("GET", /^\/api\/models\/providers(\?.*)?$/, (_req, res) => {
  // useProviders hook expects array of ProviderInfo: { provider, capabilities: string[] }
  sendJson(res, [
    { provider: "openai", capabilities: ["generate_message", "generate_image"] },
    { provider: "anthropic", capabilities: ["generate_message"] },
    { provider: "ollama", capabilities: ["generate_message"] }
  ]);
});

add("GET", /^\/api\/models\/all(\?.*)?$/, (_req, res) => {
  sendJson(res, MOCK_MODELS);
});

add("GET", /^\/api\/models\/recommended.*$/, (_req, res) => {
  sendJson(res, MOCK_MODELS);
});

add("GET", /^\/api\/models\/language_models(\?.*)?$/, (_req, res) => {
  sendJson(res, MOCK_LANGUAGE_MODELS);
});

add("GET", /^\/api\/models\/.*/, (_req, res) => {
  sendJson(res, MOCK_MODELS);
});

add("DELETE", /^\/api\/models\/.*/, (_req, res) => {
  sendEmpty(res);
});

// Settings / secrets
add("GET", /^\/api\/settings\/secrets(\?.*)?$/, (_req, res) => {
  // SecretsStore expects { secrets: [...] }
  sendJson(res, { secrets: MOCK_SECRETS });
});

add("PUT", /^\/api\/settings\/secrets\/.*/, (_req, res) => {
  sendJson(res, { key: "ok", value: "ok" });
});

add("DELETE", /^\/api\/settings\/secrets\/.*/, (_req, res) => {
  sendEmpty(res);
});

// General settings — RemoteSettingStore expects { settings: [...] }
add(null, /^\/api\/settings\/.*/, (_req, res) => {
  sendJson(res, { settings: [] });
});

// Collections
add("GET", /^\/api\/collections\/.*/, (_req, res) => {
  sendJson(res, { next: null, collections: [] });
});

// Jobs
add("GET", /^\/api\/jobs\/.*/, (_req, res) => {
  sendJson(res, { next: null, jobs: [] });
});

// Packages
add("GET", /^\/api\/packages\/.*/, (_req, res) => {
  sendJson(res, []);
});

// Storage
add(null, /^\/api\/storage\/.*/, (_req, res) => {
  sendJson(res, {});
});

// Workspaces
add(null, /^\/api\/workspaces\/.*/, (_req, res) => {
  sendJson(res, {});
});

// Catch-all API fallback
add(null, /^\/api\/.*/, (_req, res) => {
  sendJson(res, {});
});

// Terminal/WebSocket endpoints — return empty 200 to suppress noise
add(null, /^\/terminal/, (_req, res) => {
  sendEmpty(res, 200);
});

// ── Server ────────────────────────────────────────────────────────────────────

export interface MockServer {
  close: () => Promise<void>;
  port: number;
}

export async function startMockServer(port = 4444): Promise<MockServer> {
  const server = http.createServer((req, res) => {
    const method = req.method ?? "GET";
    const rawUrl = req.url ?? "/";
    // Strip the base path if proxied with a prefix
    const url = rawUrl.startsWith("/api")
      ? rawUrl
      : rawUrl.replace(/^\/[^/]+/, "");

    // Handle CORS preflight
    if (method === "OPTIONS") {
      sendEmpty(res, 204);
      return;
    }

    // Find matching route
    for (const route of routes) {
      if (route.method !== null && route.method !== method) continue;
      const match = url.match(route.pattern);
      if (match) {
        try {
          route.handler(req, res, match);
        } catch (err) {
          sendJson(res, { error: String(err) }, 500);
        }
        return;
      }
    }

    // No route matched
    console.warn(`[mock-server] Unhandled: ${method} ${url}`);
    sendJson(res, { error: "Not found" }, 404);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  console.log(`[mock-server] Listening on http://127.0.0.1:${port}`);

  return {
    port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      })
  };
}
