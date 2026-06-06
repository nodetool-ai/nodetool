/**
 * Local browser-action functions backed by Chrome DevTools Protocol.
 *
 * Mirrors `packages/sandbox-agent/src/tools/browser.ts` but runs inside the
 * host process — the agent shares a single Chrome instance across calls so
 * cookies, navigation history, and indexed elements persist between actions.
 *
 * Element indexing on `browser_view`: a JS expression assigns a sequential
 * `data-nt-idx` attribute to interactive elements; subsequent click/input/
 * select_option tools address by that index. Indexes are rebuilt on every
 * view, so callers must view before relying on an index.
 */

import type {
  BrowserViewInput,
  BrowserViewOutput,
  BrowserNavigateInput,
  BrowserNavigateOutput,
  BrowserRestartInput,
  BrowserRestartOutput,
  BrowserClickInput,
  BrowserClickOutput,
  BrowserInputTextInput,
  BrowserInputTextOutput,
  BrowserMoveMouseInput,
  BrowserMoveMouseOutput,
  BrowserPressKeyInput,
  BrowserPressKeyOutput,
  BrowserSelectOptionInput,
  BrowserSelectOptionOutput,
  BrowserScrollInput,
  BrowserScrollOutput,
  BrowserConsoleExecInput,
  BrowserConsoleExecOutput,
  BrowserConsoleViewInput,
  BrowserConsoleViewOutput,
  BrowserCaptureMediaInput,
  BrowserCaptureMediaRaw,
  BrowserUploadAssetRaw,
  BrowserUploadAssetOutput,
  BrowserElement,
  BrowserConsoleMessage
} from "@nodetool-ai/sandbox/schemas";
import { Buffer } from "node:buffer";
import { createLogger } from "@nodetool-ai/config";
import type { CdpPage } from "./cdp-page.js";
import { captureMediaInPage } from "./browser-capture.js";
import { uploadAssetToInput } from "./browser-upload.js";

const log = createLogger("nodetool.automation.browser-extension");

const CONSOLE_BUFFER_MAX = 500;

/** How many recent response bodies the capture rung-1 tracker remembers. */
const RESPONSE_TRACKER_MAX = 256;

/**
 * Minimal `chrome-remote-interface`-shaped surface the capture ladder uses for
 * its rung-1 `Network.getResponseBody` lookup. Both the local CDP client and
 * the synthetic extension client satisfy it.
 */
interface CaptureCdpClient {
  Network: {
    responseReceived(
      cb: (evt: Record<string, unknown>) => void
    ): () => void;
    loadingFinished(
      cb: (evt: Record<string, unknown>) => void
    ): () => void;
    getResponseBody(params: {
      requestId: string;
    }): Promise<{ body: string; base64Encoded: boolean }>;
  };
}

/**
 * Tracks finished network responses by URL so capture_media can pull bytes via
 * `Network.getResponseBody` (rung 1) before falling back to an in-page fetch.
 * The map is bounded to the most recent {@link RESPONSE_TRACKER_MAX} entries.
 */
interface ResponseTracker {
  /** Resolve the requestId + MIME for the most recent response at `url`. */
  lookup(url: string): { requestId: string; mime: string } | null;
}

function attachResponseTracker(client: CaptureCdpClient): ResponseTracker {
  const byUrl = new Map<string, { requestId: string; mime: string }>();
  const order: string[] = [];
  client.Network.responseReceived((evt) => {
    const response = evt.response as
      | { url?: string; mimeType?: string }
      | undefined;
    const requestId = evt.requestId;
    if (!response?.url || typeof requestId !== "string") return;
    if (!byUrl.has(response.url)) order.push(response.url);
    byUrl.set(response.url, {
      requestId,
      mime: response.mimeType ?? "application/octet-stream"
    });
    while (order.length > RESPONSE_TRACKER_MAX) {
      const evicted = order.shift();
      if (evicted !== undefined) byUrl.delete(evicted);
    }
  });
  return {
    lookup: (url) => byUrl.get(url) ?? null
  };
}

/** Which transport backs the shared {@link CdpPage}. */
type BrowserTransport = "local" | "extension";

interface BrowserState {
  page: CdpPage;
  close: () => Promise<void>;
  consoleMessages: BrowserConsoleMessage[];
  /** How the page was built — determines the {@link browserRestart} strategy. */
  transport: BrowserTransport;
  /**
   * Tracks finished network responses for capture_media's rung-1 lookup. Null
   * when the underlying client doesn't expose the Network domain we need.
   */
  responseTracker: ResponseTracker | null;
  /** Raw CDP client for rung-1 `Network.getResponseBody`. */
  captureClient: CaptureCdpClient | null;
}

let state: BrowserState | null = null;
let shutdownHooked = false;

/**
 * Resolve the transport for the shared browser session.
 *
 * The extension transport drives the user's real, logged-in Chrome via the
 * `/ws/extension` side channel. It is selected by `NODETOOL_BROWSER_TRANSPORT`
 * or implied by the presence of `NODETOOL_EXTENSION_WS_URL`.
 */
function resolveTransport(): BrowserTransport {
  if (process.env.NODETOOL_BROWSER_TRANSPORT === "extension") return "extension";
  if (process.env.NODETOOL_EXTENSION_WS_URL) return "extension";
  return "local";
}

/**
 * Wire the console ring buffer to a {@link CdpPage}. Console events flow through
 * the same `CdpPage` path regardless of transport, so this is shared verbatim
 * between the local and extension branches.
 */
function attachConsoleBuffer(
  page: CdpPage,
  consoleMessages: BrowserConsoleMessage[]
): void {
  page.on("console", (msg) => {
    consoleMessages.push({
      type: msg.type,
      text: msg.text,
      timestamp: Date.now()
    });
    if (consoleMessages.length > CONSOLE_BUFFER_MAX) {
      consoleMessages.splice(0, consoleMessages.length - CONSOLE_BUFFER_MAX);
    }
  });
}

function hookShutdown(): void {
  if (shutdownHooked || typeof process === "undefined") return;
  shutdownHooked = true;
  const onExit = (): void => {
    if (state) {
      // Best-effort, synchronous fire-and-forget — process is exiting.
      state.close().catch(() => undefined);
      state = null;
    }
  };
  process.once("SIGINT", onExit);
  process.once("SIGTERM", onExit);
  process.once("exit", onExit);
}

async function ensureState(): Promise<BrowserState> {
  if (state) return state;
  const transport = resolveTransport();
  const consoleMessages: BrowserConsoleMessage[] = [];

  if (transport === "extension") {
    const { createExtensionPage } = await import("./extension-cdp-page.js");
    const { getInProcessExtensionChannel } = await import(
      "./extension-channel-provider.js"
    );
    // In-server: ride the ExtensionBridge channel. Out-of-server (e.g. CLI):
    // fall back to the WS-URL client (NODETOOL_EXTENSION_WS_URL / default).
    const channel = getInProcessExtensionChannel();
    // The in-process bridge channel exposes `connected` (whether an extension
    // socket is currently registered) — the single most useful signal when the
    // extension "fails": if false here, no extension is attached to the server.
    const connected = (channel as { connected?: boolean } | null)?.connected;
    log.info("Extension transport selected", {
      channel: channel ? "in-process bridge" : "ws-url fallback",
      extensionConnected: connected ?? "unknown",
      wsUrl:
        process.env.NODETOOL_EXTENSION_WS_URL ??
        "ws://localhost:7777/ws/extension"
    });
    if (channel && connected === false) {
      log.warn(
        "No browser extension is connected to /ws/extension — attach will " +
          "time out. Install the extension and click 'Attach to this tab'."
      );
    }
    let handle: Awaited<ReturnType<typeof createExtensionPage>>;
    try {
      handle = await createExtensionPage(channel ?? undefined, {
        viewport: { width: 1280, height: 900 }
      });
      log.info("Extension attached; CDP page ready");
    } catch (err) {
      log.error(
        "Failed to attach to browser extension",
        err instanceof Error ? err : new Error(String(err))
      );
      throw err;
    }
    attachConsoleBuffer(handle.page, consoleMessages);
    const captureClient = handle.client as unknown as CaptureCdpClient;
    state = {
      page: handle.page,
      close: handle.close,
      consoleMessages,
      transport,
      captureClient,
      responseTracker: attachResponseTracker(captureClient)
    };
    hookShutdown();
    return state;
  }

  const { launchBrowser, CdpPage: CdpPageCls } = await import("./cdp-page.js");
  const headless = process.env.NODETOOL_BROWSER_HEADLESS !== "false";
  const session = await launchBrowser({
    headless,
    viewport: { width: 1280, height: 900 }
  });
  const page = await CdpPageCls.create(session.client, {
    width: 1280,
    height: 900
  });

  attachConsoleBuffer(page, consoleMessages);

  const captureClient = session.client as unknown as CaptureCdpClient;
  state = {
    page,
    close: session.close,
    consoleMessages,
    transport,
    captureClient,
    responseTracker: attachResponseTracker(captureClient)
  };
  hookShutdown();
  return state;
}

export async function browserView(
  input: BrowserViewInput
): Promise<BrowserViewOutput> {
  const s = await ensureState();
  const { page } = s;

  const elements = (await page.evaluate(() => {
    const SELECTOR =
      "a, button, input, select, textarea, [role='button'], [role='link'], [role='checkbox'], [role='radio'], [role='menuitem'], [role='tab'], [onclick], [tabindex]";
    const nodes = Array.from(document.querySelectorAll(SELECTOR));
    return nodes.flatMap((el, i) => {
      const he = el as HTMLElement;
      const rect = he.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return [];
      const style = window.getComputedStyle(he);
      if (style.visibility === "hidden" || style.display === "none") return [];
      he.setAttribute("data-nt-idx", String(i));
      const attrs: Record<string, string> = {};
      for (const a of Array.from(he.attributes)) {
        if (a.name.startsWith("data-nt-")) continue;
        attrs[a.name] = a.value;
      }
      return [
        {
          index: i,
          tag: he.tagName.toLowerCase(),
          role: he.getAttribute("role"),
          text: (he.innerText || he.getAttribute("value") || "").slice(0, 200),
          attributes: attrs,
          bbox: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
          }
        }
      ];
    });
  })) as BrowserElement[];

  const viewport = page.viewportSize();
  const url = page.url();
  const title = await page.title();

  const want =
    input.include_screenshot === undefined ? true : input.include_screenshot;
  let screenshot: string | null = null;
  if (want) {
    const buf = await page.screenshot({ fullPage: false });
    screenshot = buf.toString("base64");
  }

  return { url, title, viewport, elements, screenshot_png_b64: screenshot };
}

export async function browserNavigate(
  input: BrowserNavigateInput
): Promise<BrowserNavigateOutput> {
  const s = await ensureState();
  const waitUntil = input.wait_until ?? "load";
  const res = await s.page.goto(input.url, { waitUntil });
  return {
    url: s.page.url(),
    title: await s.page.title(),
    status: res.status
  };
}

export async function browserRestart(
  input: BrowserRestartInput
): Promise<BrowserRestartOutput> {
  // Local transport: close() kills Chrome, ensureState() relaunches it.
  // Extension transport: close() detaches the debugger (Chrome stays alive),
  // ensureState() re-attaches to the active tab. Same detach+re-attach cycle,
  // no Chrome process is killed.
  if (state) {
    try {
      await state.close();
    } catch {
      // ignore
    }
    state = null;
  }
  const s = await ensureState();
  if (input.url) {
    await s.page.goto(input.url, { waitUntil: "load" });
  }
  return { url: s.page.url() };
}

export async function browserClick(
  input: BrowserClickInput
): Promise<BrowserClickOutput> {
  const s = await ensureState();
  if (input.index !== undefined) {
    await s.page.click(`[data-nt-idx="${input.index}"]`);
  } else {
    await s.page.mouse.click(input.coordinate_x!, input.coordinate_y!);
  }
  return { clicked: true };
}

export async function browserInput(
  input: BrowserInputTextInput
): Promise<BrowserInputTextOutput> {
  const s = await ensureState();
  if (input.index !== undefined) {
    const sel = `[data-nt-idx="${input.index}"]`;
    await s.page.fill(sel, input.text);
    if (input.press_enter) {
      await s.page.press(sel, "Enter");
    }
  } else {
    await s.page.mouse.click(input.coordinate_x!, input.coordinate_y!);
    await s.page.keyboard.type(input.text);
    if (input.press_enter) {
      await s.page.keyboard.press("Enter");
    }
  }
  return { typed: true };
}

export async function browserMoveMouse(
  input: BrowserMoveMouseInput
): Promise<BrowserMoveMouseOutput> {
  const s = await ensureState();
  await s.page.mouse.move(input.coordinate_x, input.coordinate_y);
  return { moved: true };
}

export async function browserPressKey(
  input: BrowserPressKeyInput
): Promise<BrowserPressKeyOutput> {
  const s = await ensureState();
  await s.page.keyboard.press(input.key);
  return { pressed: true };
}

export async function browserSelectOption(
  input: BrowserSelectOptionInput
): Promise<BrowserSelectOptionOutput> {
  const s = await ensureState();
  const sel = `[data-nt-idx="${input.index}"]`;
  const selected = await s.page.selectOption(sel, input.option);
  return { selected };
}

export async function browserScroll(
  input: BrowserScrollInput
): Promise<BrowserScrollOutput> {
  const s = await ensureState();
  const args = {
    top: input.to_top === true,
    bottom: input.to_bottom === true,
    pixels: input.pixels ?? null
  };
  const scrollY = await s.page.evaluate(
    (a: { top: boolean; bottom: boolean; pixels: number | null }) => {
      if (a.top) {
        window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      } else if (a.bottom) {
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: "instant" as ScrollBehavior
        });
      } else if (a.pixels !== null) {
        window.scrollBy({
          top: a.pixels,
          behavior: "instant" as ScrollBehavior
        });
      }
      return window.scrollY;
    },
    args
  );
  return { scroll_y: scrollY as number };
}

export async function browserConsoleExec(
  input: BrowserConsoleExecInput
): Promise<BrowserConsoleExecOutput> {
  const s = await ensureState();
  const result = await s.page.evaluate(input.javascript);
  return { result_json: JSON.stringify(result ?? null) };
}

export async function browserConsoleView(
  input: BrowserConsoleViewInput
): Promise<BrowserConsoleViewOutput> {
  const s = await ensureState();
  const max = input.max_lines ?? 100;
  const messages = s.consoleMessages.slice(-max);
  return { messages };
}

/**
 * Capture generated media from the page as bytes, via the capture ladder:
 *
 *   1. `Network.getResponseBody` for a tracked requestId (when a `resource_url`
 *      the page already fetched is given). Cheapest — no re-fetch.
 *   2. In-page `fetch()` of a `blob:`/`<video>`/`<audio>`/`<img>` source to an
 *      ArrayBuffer, base64 back. The universal rung.
 *
 * Rung 3 (extension `chrome.downloads` → media_chunk/media_end) is not wired in
 * this build; rungs 1–2 cover the consumer media-generation UIs we target.
 *
 * Returns raw base64 bytes + MIME; the calling tool wrapper persists them as an
 * asset via the same `persistOutput` path screenshots use.
 */
export async function browserCaptureMedia(
  input: BrowserCaptureMediaInput
): Promise<BrowserCaptureMediaRaw> {
  const s = await ensureState();

  // Rung 1: a response body the page already fetched, addressed by URL.
  const resourceUrl = input.resource_url;
  if (resourceUrl && s.responseTracker && s.captureClient) {
    const hit = s.responseTracker.lookup(resourceUrl);
    if (hit) {
      try {
        const { body, base64Encoded } =
          await s.captureClient.Network.getResponseBody({
            requestId: hit.requestId
          });
        const media_b64 = base64Encoded
          ? body
          : Buffer.from(body, "utf-8").toString("base64");
        if (media_b64.length > 0) {
          return {
            media_b64,
            mime_type: hit.mime || "application/octet-stream",
            source_url: resourceUrl,
            via: "response_body"
          };
        }
      } catch {
        // Body evicted or unavailable — fall through to the in-page fetch.
      }
    }
  }

  // Rung 2: in-page fetch (handles index / url / resource_url uniformly).
  return captureMediaInPage(s.page, input);
}

/**
 * Inject a NodeTool asset (resolved to bytes host-side) into a page file input.
 *
 * Tries native `DOM.setFileInputFiles` against a temp file this process writes
 * — reachable by the local host Chrome and the sandbox container's Chrome — and
 * falls back to an in-page DataTransfer `File` injection when no path is
 * reachable (the extension transport drives the user's own machine). The
 * fallback is automatic.
 */
export async function browserUploadAsset(
  input: BrowserUploadAssetRaw
): Promise<BrowserUploadAssetOutput> {
  const s = await ensureState();
  return uploadAssetToInput(s.page, input);
}

export async function _shutdownLocalBrowser(): Promise<void> {
  if (state) {
    try {
      await state.close();
    } catch {
      // ignore
    }
    state = null;
  }
}
