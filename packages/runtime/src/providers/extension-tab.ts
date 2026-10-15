/**
 * A logged-in tab in the user's own Chrome, reached through the NodeTool
 * extension's native messaging bridge. Browser-driven providers (ChatGPT and
 * Gemini web) run their requests inside such a tab so the site's own origin,
 * cookies and anti-abuse checks apply.
 */
import { randomUUID } from "node:crypto";
import { createLogger } from "@nodetool-ai/config";

const log = createLogger("nodetool.runtime.providers.extension-tab");

/** The extension keeps the debugger attached between calls, then detaches when idle. */
const IDLE_CLOSE_MS = 30_000;
/** Default limit for one evaluation, so a stalled tab or bridge cannot hang a caller. */
export const TAB_CALL_TIMEOUT_MS = 45_000;
/**
 * Chrome caps a native-host-to-extension message at 1 MB. A larger script
 * closes the bridge, so bytes for the page are staged in pieces below that.
 */
const STAGE_PIECE_CHARS = 400_000;
/** Bytes per body read on a download. Their base64 form stays below the same 1 MB cap. */
const READ_PIECE_BYTES = 400_000;

/** Runs scripts in one site's tab. */
export interface ExtensionTab {
  /** Release exclusive bridge ownership after the entire provider turn. */
  release?(): Promise<void>;
  /** Run `expression` (a JS expression, may be a promise) in the tab and return its JSON value. */
  evaluate(expression: string, timeoutMs?: number, signal?: AbortSignal): Promise<unknown>;
  /** Navigate the tab and wait for the load event. */
  navigate(url: string, signal?: AbortSignal): Promise<void>;
  /**
   * Load `url` with the browser's cookies for it and return the body. The
   * browser loads it, not the page, so the page's CORS rules do not apply.
   */
  download(url: string, timeoutMs?: number, signal?: AbortSignal): Promise<Uint8Array>;
}

/** A tab call that did not answer in time. Its outcome is unknown. */
export class ExtensionTabStallError extends Error {}

/**
 * Attach to the open tab whose URL contains `host`. One attach serves every
 * operation until its caller releases ownership, with an idle fallback. Any error drops
 * the attach, so the next call attaches afresh.
 */
export function createExtensionTab(host: string): ExtensionTab {
  type Handle = Awaited<ReturnType<typeof import("@nodetool-ai/browser").createExtensionPage>>;
  let handle: Handle | null = null;
  let opening: Promise<Handle> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let busy = 0;
  let generation = 0;
  let openingAbort: AbortController | null = null;

  const drop = async (): Promise<void> => {
    generation += 1;
    openingAbort?.abort();
    openingAbort = null;
    opening = null;
    const current = handle;
    handle = null;
    if (current) await current.close().catch(() => undefined);
  };

  const open = async (signal: AbortSignal): Promise<Handle> => {
    const { createExtensionPage } = await import("@nodetool-ai/browser");
    const next = await createExtensionPage(undefined, { urlMatch: host, signal });
    try {
      const attachedHost = await next.page.evaluate<string>("location.hostname");
      if (attachedHost !== host) {
        throw new Error(`The attached tab is ${attachedHost || "not a web page"}. Open https://${host}, sign in, and try again`);
      }
    } catch (error) {
      await next.close().catch(() => undefined);
      throw error;
    }
    return next;
  };

  const withPage = async <T>(what: string, timeoutMs: number, run: (current: Handle) => Promise<T>, signal?: AbortSignal): Promise<T> => {
    signal?.throwIfAborted();
    if (idleTimer) clearTimeout(idleTimer);
    busy += 1;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ExtensionTabStallError(`The ${host} tab did not answer ${what} within ${timeoutMs / 1000}s`)), timeoutMs);
      timer.unref?.();
    });
    let onAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(signal?.reason ?? new Error("Aborted"));
      signal?.addEventListener("abort", onAbort, { once: true });
    });
    const operationGeneration = generation;
    let expired = false;
    try {
      const work = (async () => {
        if (!handle) {
          if (!opening) {
            openingAbort = new AbortController();
            const pending = open(openingAbort.signal).finally(() => { if (opening === pending) opening = null; });
            opening = pending;
          }
          const next = await opening;
          if (expired || operationGeneration !== generation) {
            await next.close().catch(() => undefined);
            throw new ExtensionTabStallError("Tab opening was abandoned");
          }
          handle = next;
        }
        signal?.throwIfAborted();
        return run(handle);
      })();
      // Keep a late rejection from surfacing as unhandled after the timeout won.
      work.catch(() => undefined);
      return await Promise.race([work, timeout, aborted]);
    } catch (error) {
      expired = true;
      await drop();
      throw error;
    } finally {
      if (onAbort) signal?.removeEventListener("abort", onAbort);
      clearTimeout(timer);
      busy -= 1;
      if (busy === 0) {
        idleTimer = setTimeout(() => void drop(), IDLE_CLOSE_MS);
        idleTimer.unref?.();
      }
    }
  };

  return {
    release: drop,
    evaluate: (expression, timeoutMs = TAB_CALL_TIMEOUT_MS, signal) =>
      withPage("a script", timeoutMs, async (current) => {
        // Chrome can freeze a background tab. A frozen page still runs this
        // script but none of its own tasks, so a click or a timer would wait
        // until the user shows the tab. Unfreezing first keeps it working.
        await current.client.Page.setWebLifecycleState({ state: "active" }).catch(() => undefined);
        signal?.throwIfAborted();
        return current.page.evaluate(expression);
      }, signal),
    navigate: (url, signal) =>
      withPage(`loading ${url}`, TAB_CALL_TIMEOUT_MS, async (current) => {
        log.debug("Navigating tab", { url });
        await current.page.goto(url, { waitUntil: "load", timeout: TAB_CALL_TIMEOUT_MS - 5_000 });
      }, signal),
    download: (url, timeoutMs = TAB_CALL_TIMEOUT_MS, signal) =>
      withPage("a download", timeoutMs, (current) => downloadWithBrowser(current.client, url), signal)
  };
}

type CdpClient = Awaited<ReturnType<typeof import("@nodetool-ai/browser").createExtensionPage>>["client"];

/** Load `url` through `Network.loadNetworkResource` and read its body stream in pieces. */
async function downloadWithBrowser(client: CdpClient, url: string): Promise<Uint8Array> {
  const tree = (await client.Page.getFrameTree()) as { frameTree: { frame: { id: string } } };
  const { resource } = (await client.Network.loadNetworkResource({
    frameId: tree.frameTree.frame.id,
    url,
    options: { disableCache: false, includeCredentials: true }
  })) as { resource: { success: boolean; httpStatusCode?: number; netErrorName?: string; stream?: string } };
  if (!resource.success || !resource.stream) {
    throw new Error(`Download failed: ${resource.httpStatusCode ? `HTTP ${resource.httpStatusCode}` : resource.netErrorName ?? "no response"}`);
  }
  const chunks: Buffer[] = [];
  try {
    for (;;) {
      const piece = (await client.IO.read({ handle: resource.stream, size: READ_PIECE_BYTES })) as { data: string; base64Encoded?: boolean; eof: boolean };
      chunks.push(Buffer.from(piece.data, piece.base64Encoded ? "base64" : "utf8"));
      if (piece.eof) break;
    }
  } finally {
    await client.IO.close({ handle: resource.stream }).catch(() => undefined);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

/** How often {@link pollTab} asks the page again. */
const POLL_TAB_INTERVAL_MS = 250;

/**
 * Evaluate `expression` until it returns a truthy value and return that value,
 * or null when `timeoutMs` passes first.
 *
 * The waiting runs here, never in the page. Chrome throttles the chained
 * timers of a page hidden for five minutes to one wake-up a minute, so a
 * `setTimeout` loop inside the page can take minutes per step, while each
 * evaluation from here runs at once. Page scripts therefore do one step each
 * and leave every wait to this loop.
 */
export async function pollTab<T>(tab: ExtensionTab, expression: string, timeoutMs: number, signal?: AbortSignal): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    signal?.throwIfAborted();
    const value = (await tab.evaluate(expression, undefined, signal)) as T;
    if (value) return value;
    if (Date.now() >= deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, POLL_TAB_INTERVAL_MS));
  }
}

/**
 * Put `bytes` into the page as `window.__ntStage[id]` (a base64 string) and
 * return the id. A page script reads and deletes it.
 */
export async function stageBytesInTab(tab: ExtensionTab, bytes: Uint8Array, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const id = randomUUID();
  const key = JSON.stringify(id);
  const base64 = Buffer.from(bytes).toString("base64");
  await tab.evaluate(`(() => { window.__ntStage ??= {}; window.__ntStage[${key}] = ""; return true; })()`, undefined, signal);
  for (let at = 0; at < base64.length; at += STAGE_PIECE_CHARS) {
    signal?.throwIfAborted();
    const piece = JSON.stringify(base64.slice(at, at + STAGE_PIECE_CHARS));
    await tab.evaluate(`(() => { window.__ntStage[${key}] += ${piece}; return true; })()`, undefined, signal);
  }
  return id;
}
