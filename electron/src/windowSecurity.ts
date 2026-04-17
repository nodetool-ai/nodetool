/**
 * Security hardening applied to every WebContents hosted by the app.
 *
 * Lives in its own module (with a minimal dependency footprint) so that
 * all window-creation paths — main, workflow, miniapp, chat — can pull it
 * in without dragging the main process bootstrap chain behind them.
 *
 * References the Electron security checklist, specifically items 12–14:
 *   https://www.electronjs.org/docs/latest/tutorial/security
 */

import { WebContents, shell } from "electron";
import { serverState } from "./state";
import { logMessage } from "./logger";
import { isElectronDevMode, getWebDevServerUrl } from "./devMode";

/**
 * Returns true if a URL is an allowed destination for in-app navigation
 * or `window.open`. Trusted sources are:
 *   - The bundled backend server (`http://127.0.0.1:<serverPort>`)
 *   - The Vite dev server when running in dev mode
 *   - `file://` loads of the packaged web bundle
 *   - `data:` / `about:blank` used for splash/loading screens
 */
export function isTrustedInAppUrl(rawUrl: string): boolean {
  if (!rawUrl || rawUrl === "about:blank") {
    return true;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  // Splash/loading screens and local resources
  if (parsed.protocol === "file:" || parsed.protocol === "data:") {
    return true;
  }

  if (parsed.protocol !== "http:") {
    return false;
  }

  const isLocalHost =
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  if (!isLocalHost) {
    return false;
  }

  // Backend server port
  const backendPort = String(serverState?.serverPort ?? 7777);
  if (parsed.port === backendPort) {
    return true;
  }

  // Vite dev server port when in dev mode
  if (isElectronDevMode()) {
    try {
      const devUrl = new URL(getWebDevServerUrl());
      if (parsed.port === devUrl.port) {
        return true;
      }
    } catch {
      // fall through
    }
  }

  return false;
}

/**
 * Hardens a WebContents against untrusted navigation and popups.
 *   - Intercepts `will-navigate` / `will-redirect` and blocks off-origin loads
 *   - Routes `setWindowOpenHandler` external links through the OS browser
 *   - Disables `<webview>` attachment entirely (we don't use it)
 */
export function hardenWebContents(contents: WebContents): void {
  contents.on("will-navigate", (event, url) => {
    if (!isTrustedInAppUrl(url)) {
      logMessage(`Blocking will-navigate to untrusted URL: ${url}`, "warn");
      event.preventDefault();
    }
  });

  contents.on("will-redirect", (event, url) => {
    if (!isTrustedInAppUrl(url)) {
      logMessage(`Blocking will-redirect to untrusted URL: ${url}`, "warn");
      event.preventDefault();
    }
  });

  contents.setWindowOpenHandler(({ url }) => {
    // In-app navigation to a trusted URL is unexpected via window.open —
    // treat any popup as external and hand it to the OS browser.
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        void shell.openExternal(url);
      } else {
        logMessage(
          `Blocking window.open for unsupported protocol: ${url}`,
          "warn",
        );
      }
    } catch {
      logMessage(`Blocking window.open for malformed URL: ${url}`, "warn");
    }
    return { action: "deny" };
  });

  contents.on("will-attach-webview", (event) => {
    // We never use <webview>; deny all attachments defensively.
    logMessage("Blocking <webview> attachment", "warn");
    event.preventDefault();
  });
}
