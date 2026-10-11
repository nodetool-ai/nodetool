/**
 * A logged-in tab in the user's own Chrome, reached through the NodeTool
 * extension's native messaging bridge. Browser-driven providers (the ChatGPT
 * provider) run their requests inside such a tab so the site's own origin,
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

/** Runs scripts in one site's tab. */
export interface ExtensionTab {
  /** Run `expression` (a JS expression, may be a promise) in the tab and return its JSON value. */
  evaluate(expression: string, timeoutMs?: number): Promise<unknown>;
  /** Navigate the tab and wait for the load event. */
  navigate(url: string): Promise<void>;
}

/** A tab call that did not answer in time. Its outcome is unknown. */
export class ExtensionTabStallError extends Error {}

/**
 * Attach to the open tab whose URL contains `host`. One attach serves every
 * caller and closes after {@link IDLE_CLOSE_MS} without calls. Any error drops
 * the attach, so the next call attaches afresh.
 */
export function createExtensionTab(host: string): ExtensionTab {
  type Handle = Awaited<ReturnType<typeof import("@nodetool-ai/browser").createExtensionPage>>;
  let handle: Handle | null = null;
  let opening: Promise<Handle> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let busy = 0;

  const drop = async (): Promise<void> => {
    const current = handle;
    handle = null;
    if (current) await current.close().catch(() => undefined);
  };

  const open = async (): Promise<Handle> => {
    const { createExtensionPage } = await import("@nodetool-ai/browser");
    const next = await createExtensionPage(undefined, { urlMatch: host });
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

  const withPage = async <T>(what: string, timeoutMs: number, run: (current: Handle) => Promise<T>): Promise<T> => {
    if (idleTimer) clearTimeout(idleTimer);
    busy += 1;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ExtensionTabStallError(`The ${host} tab did not answer ${what} within ${timeoutMs / 1000}s`)), timeoutMs);
      timer.unref?.();
    });
    try {
      const work = (async () => {
        if (!handle) {
          opening ??= open().finally(() => { opening = null; });
          handle = await opening;
        }
        return run(handle);
      })();
      // Keep a late rejection from surfacing as unhandled after the timeout won.
      work.catch(() => undefined);
      return await Promise.race([work, timeout]);
    } catch (error) {
      await drop();
      throw error;
    } finally {
      clearTimeout(timer);
      busy -= 1;
      if (busy === 0) {
        idleTimer = setTimeout(() => void drop(), IDLE_CLOSE_MS);
        idleTimer.unref?.();
      }
    }
  };

  return {
    evaluate: (expression, timeoutMs = TAB_CALL_TIMEOUT_MS) =>
      withPage("a script", timeoutMs, (current) => current.page.evaluate(expression)),
    navigate: (url) =>
      withPage(`loading ${url}`, TAB_CALL_TIMEOUT_MS, async (current) => {
        log.debug("Navigating tab", { url });
        await current.page.goto(url, { waitUntil: "load", timeout: TAB_CALL_TIMEOUT_MS - 5_000 });
      })
  };
}

/**
 * Put `bytes` into the page as `window.__ntStage[id]` (a base64 string) and
 * return the id. A page script reads and deletes it.
 */
export async function stageBytesInTab(tab: ExtensionTab, bytes: Uint8Array): Promise<string> {
  const id = randomUUID();
  const key = JSON.stringify(id);
  const base64 = Buffer.from(bytes).toString("base64");
  await tab.evaluate(`(() => { window.__ntStage ??= {}; window.__ntStage[${key}] = ""; return true; })()`);
  for (let at = 0; at < base64.length; at += STAGE_PIECE_CHARS) {
    const piece = JSON.stringify(base64.slice(at, at + STAGE_PIECE_CHARS));
    await tab.evaluate(`(() => { window.__ntStage[${key}] += ${piece}; return true; })()`);
  }
  return id;
}
