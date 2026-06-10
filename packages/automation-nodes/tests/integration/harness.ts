/**
 * Integration harness for the Chrome-extension CDP proxy.
 *
 * Stands up the real round-trip — there is no mocking below the test:
 *
 *   test (host)            real ExtensionCdpClient + ExtensionCdpPage
 *      |  ws://…/ws/extension          |
 *      v                               v
 *   ws server  <----JSON frames---->  extension service worker (chrome.debugger)
 *                                        |
 *                                        v
 *                                   fixture page in headless Chrome
 *
 * The extension is the *only* CDP client on the tab — the test never attaches a
 * debugger itself (Playwright/Puppeteer would contend with `chrome.debugger`).
 * Chrome is launched with `chrome-launcher` and the built extension loaded; the
 * test plays the role nodetool plays in production, talking to the extension
 * over the `/ws/extension` side channel.
 *
 * The ws→{@link ExtensionChannel} adapter here mirrors the production
 * `ExtensionBridge` (in `@nodetool-ai/websocket`), reimplemented locally so the
 * test does not invert the package dependency (websocket → automation-nodes).
 */

import http from "node:http";
import path from "node:path";
import { existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AddressInfo } from "node:net";
import { launch, type LaunchedChrome } from "chrome-launcher";
import { WebSocketServer, type WebSocket as WsSocket } from "ws";
import {
  createExtensionPage,
  type ExtensionPageHandle
} from "../../src/lib/extension-cdp-page.js";
import type { ExtensionChannel } from "../../src/lib/extension-cdp-client.js";
import {
  parseExtensionFrame,
  type ExtensionFrame
} from "../../src/lib/extension-protocol.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Repo root: packages/automation-nodes/tests/integration → ../../../.. */
const REPO_ROOT = path.resolve(__dirname, "../../../..");
const EXTENSION_DIST = path.join(REPO_ROOT, "chrome-extension", "dist");

/**
 * The extension connects to its hardcoded default `/ws/extension` URL unless
 * overridden via `chrome.storage` (which we cannot set before the service
 * worker starts). So the bridge server must bind this exact port.
 */
const EXTENSION_WS_PORT = 7777;

/** A 1×1 red PNG. The capture assertions compare against these exact bytes. */
export const FIXTURE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** Marker text and element indices baked into the fixture page. */
export const FIXTURE_MARKER = "nodetool-fixture-marker";
export const FIXTURE_IMG_INDEX = 0;
export const FIXTURE_FILE_INPUT_INDEX = 1;

const FIXTURE_HTML = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>NT Fixture</title></head>
  <body>
    <h1 id="hdr">${FIXTURE_MARKER}</h1>
    <img id="shot" data-nt-idx="${FIXTURE_IMG_INDEX}" src="/fixture.png" alt="fixture" />
    <input id="file-in" type="file" data-nt-idx="${FIXTURE_FILE_INPUT_INDEX}" />
    <input id="text-in" type="text" />
    <button id="btn" type="button" onclick="this.textContent='clicked'">go</button>
  </body>
</html>`;

export interface ExtensionBrowserHarness {
  /** The transport-agnostic page driven by the production action loop. */
  handle: ExtensionPageHandle;
  /** Base URL of the fixture site, e.g. http://127.0.0.1:54321 */
  fixtureUrl: string;
  /** Absolute URL of the fixture image. */
  fixtureImageUrl: string;
  /** Tear down page, Chrome, ws server, and http server. */
  close(): Promise<void>;
}

/** Wrap a `ws` socket as the {@link ExtensionChannel} the client consumes. */
function makeChannel(socket: WsSocket): ExtensionChannel {
  let handler: ((frame: ExtensionFrame) => void) | null = null;
  socket.on("message", (raw: Buffer) => {
    const frame = parseExtensionFrame(raw.toString("utf8"));
    if (frame && handler) handler(frame);
  });
  socket.on("close", () => {
    // Surface disconnects so the client rejects pending commands, matching the
    // production bridge's synthetic error frame.
    handler?.({ kind: "error", message: "Extension connection closed" });
  });
  return {
    send(frame) {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(frame));
    },
    onMessage(cb) {
      handler = cb;
    },
    close() {
      try {
        socket.close();
      } catch {
        /* already closing */
      }
    }
  };
}

function startFixtureServer(): Promise<{ server: http.Server; url: string }> {
  const server = http.createServer((req, res) => {
    if (req.url === "/fixture.png") {
      res.writeHead(200, { "content-type": "image/png" });
      res.end(Buffer.from(FIXTURE_PNG_BASE64, "base64"));
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(FIXTURE_HTML);
  });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

/**
 * Bind the `/ws/extension` server and resolve with the first extension socket
 * once its service worker connects.
 */
function startBridgeServer(): Promise<{
  wss: WebSocketServer;
  socket: Promise<WsSocket>;
}> {
  const wss = new WebSocketServer({
    port: EXTENSION_WS_PORT,
    path: "/ws/extension"
  });

  let resolveSocket: (s: WsSocket) => void;
  let rejectSocket: (err: Error) => void;
  const socket = new Promise<WsSocket>((resolve, reject) => {
    resolveSocket = resolve;
    rejectSocket = reject;
  });
  wss.on("connection", (s: WsSocket) => resolveSocket(s));

  return new Promise((resolve, reject) => {
    wss.on("error", (err) => {
      rejectSocket(err);
      reject(
        new Error(
          `Could not bind ws://127.0.0.1:${EXTENSION_WS_PORT}/ws/extension ` +
            `(is a nodetool server already on ${EXTENSION_WS_PORT}?): ${err.message}`
        )
      );
    });
    wss.on("listening", () => resolve({ wss, socket }));
  });
}

/**
 * Locate a Chrome binary that permits `--load-extension`.
 *
 * Branded Google Chrome silently refuses `--load-extension` /
 * `--disable-extensions-except` ("not allowed in Google Chrome, ignoring"), so
 * the extension never loads. Chrome for Testing has no such restriction. We
 * honor an explicit override, else auto-discover the `@puppeteer/browsers`
 * install under `<repo>/chrome`.
 */
function resolveTestChrome(): string {
  const explicit = process.env.NODETOOL_TEST_CHROME ?? process.env.CHROME_PATH;
  if (explicit && existsSync(explicit)) return explicit;

  const binaryName =
    process.platform === "darwin"
      ? "Google Chrome for Testing"
      : process.platform === "win32"
        ? "chrome.exe"
        : "chrome";
  const found = findFile(path.join(REPO_ROOT, "chrome"), binaryName, 6);
  if (found) return found;

  throw new Error(
    "Chrome for Testing not found. Branded Google Chrome forbids " +
      "--load-extension, so install Chrome for Testing first:\n" +
      "  npx @puppeteer/browsers install chrome@stable\n" +
      "or set NODETOOL_TEST_CHROME to a Chromium/Chrome-for-Testing binary."
  );
}

/** Shallow recursive search for an executable by exact name. */
function findFile(dir: string, name: string, depth: number): string | null {
  if (depth < 0 || !existsSync(dir)) return null;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (!isDir && entry === name) return full;
    if (isDir) {
      const hit = findFile(full, name, depth - 1);
      if (hit) return hit;
    }
  }
  return null;
}

async function launchChromeWithExtension(
  startingUrl: string
): Promise<LaunchedChrome> {
  const headless = process.env.HEADLESS !== "0";
  const flags = [
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    // Re-enable the extension-loading switch newer Chrome gates by default.
    "--disable-features=DisableLoadExtensionCommandLineSwitch",
    `--disable-extensions-except=${EXTENSION_DIST}`,
    `--load-extension=${EXTENSION_DIST}`,
    "--window-size=1280,900"
  ];
  if (headless) flags.unshift("--headless=new");

  // ignoreDefaultFlags drops chrome-launcher's `--disable-extensions`, which
  // would otherwise prevent the extension (and its service worker) from loading.
  return launch({
    startingUrl,
    chromePath: resolveTestChrome(),
    ignoreDefaultFlags: true,
    chromeFlags: flags
  });
}

/**
 * Build the full harness: fixture site, extension bridge, headless Chrome with
 * the extension loaded, debugger attached to the fixture tab, and a ready
 * {@link ExtensionPageHandle}.
 */
export async function startExtensionBrowser(): Promise<ExtensionBrowserHarness> {
  if (!existsSync(path.join(EXTENSION_DIST, "manifest.json"))) {
    throw new Error(
      `Extension not built at ${EXTENSION_DIST}. Run ` +
        `\`npm --prefix chrome-extension run build\` first.`
    );
  }

  const { server, url: fixtureUrl } = await startFixtureServer();
  const { wss, socket: socketPromise } = await startBridgeServer();

  let chrome: LaunchedChrome | undefined;
  let handle: ExtensionPageHandle | undefined;

  const close = async (): Promise<void> => {
    if (handle) {
      try {
        await handle.close();
      } catch {
        /* page/transport already gone */
      }
    }
    if (chrome) {
      try {
        await chrome.kill();
      } catch {
        /* process already gone */
      }
    }
    await new Promise<void>((r) => wss.close(() => r()));
    await new Promise<void>((r) => server.close(() => r()));
  };

  try {
    chrome = await launchChromeWithExtension(fixtureUrl);

    // The service worker connects out to the bridge shortly after load.
    const socket = await withTimeout(
      socketPromise,
      30_000,
      "extension service worker to connect"
    );

    // Play the nodetool host: attach the debugger to the active (fixture) tab
    // and build the page over the channel.
    handle = await createExtensionPage(makeChannel(socket));

    // Navigate explicitly so the page is in a known, fully-loaded state
    // regardless of how far the starting-url load had progressed at attach.
    await handle.page.goto(fixtureUrl, { waitUntil: "load", timeout: 20_000 });

    return {
      handle,
      fixtureUrl,
      fixtureImageUrl: `${fixtureUrl}/fixture.png`,
      close
    };
  } catch (err) {
    await close();
    throw err instanceof Error ? err : new Error(String(err));
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timed out after ${timeoutMs}ms waiting for ${label}`)),
        timeoutMs
      )
    )
  ]);
}
