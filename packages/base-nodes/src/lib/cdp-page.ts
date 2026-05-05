/**
 * Minimal Page-like wrapper around the Chrome DevTools Protocol.
 *
 * Replaces the small subset of the Playwright API used by lib-browser nodes.
 * Backed by `chrome-launcher` (to start Chrome) and `chrome-remote-interface`
 * (to speak CDP). Designed to be lazy-loaded so installing Chrome is only
 * required when a browser node actually runs.
 */

import type { LaunchedChrome } from "chrome-launcher";

type CDPClient = any;

const DEFAULT_FLAGS = [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--hide-scrollbars",
  "--mute-audio",
  "--window-size=1280,900"
];

export interface LaunchOptions {
  headless?: boolean;
  /** Existing CDP endpoint port. If set, a Chrome instance is not launched. */
  port?: number;
  extraFlags?: string[];
  viewport?: { width: number; height: number };
}

export interface BrowserSession {
  /** Close the page (and Chrome, if it was launched here). */
  close(): Promise<void>;
  page: CdpPage;
}

export type WaitUntil = "load" | "domcontentloaded" | "networkidle";

interface ConsoleHandler {
  (msg: { type: string; text: string }): void;
}

export class CdpPage {
  private currentUrl = "about:blank";
  private currentTitle = "";
  private viewport: { width: number; height: number };
  private consoleHandlers: ConsoleHandler[] = [];
  private lastNavStatus: number | null = null;

  constructor(private client: CDPClient, viewport: { width: number; height: number }) {
    this.viewport = viewport;
  }

  static async create(
    client: CDPClient,
    viewport: { width: number; height: number }
  ): Promise<CdpPage> {
    const { Page, Runtime, Network, DOM, Console } = client;
    await Promise.all([
      Page.enable(),
      Runtime.enable(),
      Network.enable(),
      DOM.enable(),
      Console.enable?.()
    ]);
    const page = new CdpPage(client, viewport);
    Runtime.consoleAPICalled((evt: any) => {
      const text = (evt.args ?? [])
        .map((a: any) => (a.value !== undefined ? String(a.value) : (a.description ?? "")))
        .join(" ");
      const type = evt.type ?? "log";
      for (const h of page.consoleHandlers) h({ type, text });
    });
    Network.responseReceived((evt: any) => {
      if (evt.type === "Document") {
        page.lastNavStatus = evt.response?.status ?? null;
      }
    });
    return page;
  }

  url(): string {
    return this.currentUrl;
  }

  viewportSize(): { width: number; height: number } {
    return this.viewport;
  }

  on(event: "console", handler: ConsoleHandler): void {
    if (event === "console") this.consoleHandlers.push(handler);
  }

  async title(): Promise<string> {
    const r = await this.client.Runtime.evaluate({
      expression: "document.title",
      returnByValue: true
    });
    return r.result?.value ?? this.currentTitle;
  }

  async goto(
    url: string,
    opts: { waitUntil?: WaitUntil; timeout?: number } = {}
  ): Promise<{ status: number | null }> {
    const waitUntil: WaitUntil = opts.waitUntil ?? "load";
    const timeout = opts.timeout ?? 30000;
    this.lastNavStatus = null;

    const loadEventName =
      waitUntil === "domcontentloaded" ? "domContentEventFired" : "loadEventFired";

    const loadPromise: Promise<void> =
      waitUntil === "networkidle"
        ? waitForNetworkIdle(this.client, timeout)
        : new Promise<void>((resolve, reject) => {
            const t = setTimeout(
              () => reject(new Error(`Timed out after ${timeout}ms loading ${url}`)),
              timeout
            );
            this.client.Page.once(loadEventName, () => {
              clearTimeout(t);
              resolve();
            });
          });

    await this.client.Page.navigate({ url });
    await loadPromise;
    this.currentUrl = url;
    return { status: this.lastNavStatus };
  }

  async reload(opts: { waitUntil?: WaitUntil; timeout?: number } = {}): Promise<void> {
    const waitUntil = opts.waitUntil ?? "load";
    const timeout = opts.timeout ?? 30000;
    const loadEventName =
      waitUntil === "domcontentloaded" ? "domContentEventFired" : "loadEventFired";
    const loadPromise =
      waitUntil === "networkidle"
        ? waitForNetworkIdle(this.client, timeout)
        : new Promise<void>((resolve, reject) => {
            const t = setTimeout(
              () => reject(new Error(`Timed out after ${timeout}ms reloading`)),
              timeout
            );
            this.client.Page.once(loadEventName, () => {
              clearTimeout(t);
              resolve();
            });
          });
    await this.client.Page.reload({});
    await loadPromise;
  }

  async goBack(opts: { timeout?: number; waitUntil?: WaitUntil } = {}): Promise<void> {
    await this.historyNav(-1, opts);
  }
  async goForward(opts: { timeout?: number; waitUntil?: WaitUntil } = {}): Promise<void> {
    await this.historyNav(1, opts);
  }

  private async historyNav(
    delta: number,
    opts: { timeout?: number; waitUntil?: WaitUntil }
  ): Promise<void> {
    const history = await this.client.Page.getNavigationHistory();
    const idx = history.currentIndex + delta;
    const entry = history.entries[idx];
    if (!entry) return;
    await this.goto(entry.url, opts);
  }

  async content(): Promise<string> {
    const r = await this.client.Runtime.evaluate({
      expression: "document.documentElement.outerHTML",
      returnByValue: true
    });
    return r.result?.value ?? "";
  }

  /**
   * Run a function in the page context with arguments marshalled out-of-band
   * via CDP's `Runtime.callFunctionOn`. Argument values are passed in the
   * `arguments` array (serialised by the protocol) and never concatenated into
   * source, so untrusted strings cannot escape into executable code.
   */
  private async callFn<T = unknown>(
    fn: (...args: any[]) => any,
    ...args: any[]
  ): Promise<T> {
    const Runtime = this.client.Runtime;
    const globalRef = await Runtime.evaluate({ expression: "globalThis" });
    const objectId = globalRef.result?.objectId;
    if (!objectId) {
      throw new Error("Failed to obtain global object reference");
    }
    try {
      const r = await Runtime.callFunctionOn({
        objectId,
        functionDeclaration: fn.toString(),
        arguments: args.map((value) => ({ value })),
        returnByValue: true,
        awaitPromise: true,
        userGesture: true
      });
      if (r.exceptionDetails) {
        throw new Error(
          r.exceptionDetails.exception?.description ??
            r.exceptionDetails.text ??
            "evaluation failed"
        );
      }
      return r.result?.value as T;
    } finally {
      try {
        await Runtime.releaseObject({ objectId });
      } catch {
        // ignore
      }
    }
  }

  async evaluate<T = unknown>(
    fnOrExpr: string | ((...args: any[]) => any),
    ...args: any[]
  ): Promise<T> {
    if (typeof fnOrExpr === "function") {
      return this.callFn<T>(fnOrExpr, ...args);
    }
    const r = await this.client.Runtime.evaluate({
      expression: `(async () => { return (${fnOrExpr}); })()`,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true
    });
    if (r.exceptionDetails) {
      throw new Error(
        r.exceptionDetails.exception?.description ??
          r.exceptionDetails.text ??
          "evaluation failed"
      );
    }
    return r.result?.value as T;
  }

  async waitForSelector(
    selector: string,
    opts: { timeout?: number } = {}
  ): Promise<{ exists: true }> {
    const timeout = opts.timeout ?? 30000;
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const found = await this.callFn<boolean>(
        (sel: string) => !!document.querySelector(sel),
        selector
      );
      if (found) return { exists: true };
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`Timed out waiting for selector: ${selector}`);
  }

  async click(selector: string): Promise<void> {
    const ok = await this.callFn<boolean>(
      (sel: string) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) return false;
        el.scrollIntoView({ block: "center" });
        el.click();
        return true;
      },
      selector
    );
    if (!ok) throw new Error(`Element not found: ${selector}`);
  }

  async fill(selector: string, text: string): Promise<void> {
    const ok = await this.callFn<boolean>(
      (sel: string, val: string) => {
        const el = document.querySelector(sel) as
          | (HTMLElement & { value?: string })
          | null;
        if (!el) return false;
        el.focus();
        el.value = val;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      },
      selector,
      text
    );
    if (!ok) throw new Error(`Element not found: ${selector}`);
  }

  async press(selector: string, key: string): Promise<void> {
    await this.click(selector);
    await this.keyboard.press(key);
  }

  async selectOption(selector: string, value: string): Promise<string[]> {
    const out = await this.callFn<string[] | null>(
      (sel: string, val: string) => {
        const el = document.querySelector(sel) as HTMLSelectElement | null;
        if (!el) return null;
        el.value = val;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return [el.value];
      },
      selector,
      value
    );
    if (!out) throw new Error(`Element not found: ${selector}`);
    return out;
  }

  async screenshot(opts: { fullPage?: boolean } = {}): Promise<Buffer> {
    const { data } = await this.client.Page.captureScreenshot({
      format: "png",
      captureBeyondViewport: opts.fullPage ?? false
    });
    return Buffer.from(data, "base64");
  }

  async screenshotOfElement(selector: string): Promise<Buffer> {
    const rect = await this.callFn<{ x: number; y: number; width: number; height: number } | null>(
      (sel: string) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) return null;
        el.scrollIntoView({ block: "center" });
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      },
      selector
    );
    if (!rect) throw new Error(`Element not found: ${selector}`);
    const { data } = await this.client.Page.captureScreenshot({
      format: "png",
      clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 }
    });
    return Buffer.from(data, "base64");
  }

  readonly mouse = {
    move: async (x: number, y: number): Promise<void> => {
      await this.client.Input.dispatchMouseEvent({ type: "mouseMoved", x, y });
    },
    click: async (x: number, y: number): Promise<void> => {
      await this.client.Input.dispatchMouseEvent({
        type: "mousePressed",
        x,
        y,
        button: "left",
        clickCount: 1
      });
      await this.client.Input.dispatchMouseEvent({
        type: "mouseReleased",
        x,
        y,
        button: "left",
        clickCount: 1
      });
    }
  };

  readonly keyboard = {
    type: async (text: string): Promise<void> => {
      for (const ch of text) {
        await this.client.Input.dispatchKeyEvent({ type: "char", text: ch });
      }
    },
    press: async (key: string): Promise<void> => {
      const code = mapKey(key);
      await this.client.Input.dispatchKeyEvent({
        type: "keyDown",
        key: code.key,
        code: code.code,
        windowsVirtualKeyCode: code.vk,
        text: code.text
      });
      await this.client.Input.dispatchKeyEvent({
        type: "keyUp",
        key: code.key,
        code: code.code,
        windowsVirtualKeyCode: code.vk
      });
    }
  };
}

async function waitForNetworkIdle(client: CDPClient, timeout: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let inflight = 0;
    let idleTimer: NodeJS.Timeout | null = null;
    const overall = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out after ${timeout}ms waiting for network idle`));
    }, timeout);

    const onLoad = () => {
      if (inflight === 0) armIdle();
    };
    const onReq = () => {
      inflight++;
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    };
    const onDone = () => {
      inflight = Math.max(0, inflight - 1);
      if (inflight === 0) armIdle();
    };
    const armIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        cleanup();
        resolve();
      }, 500);
    };
    const cleanup = () => {
      clearTimeout(overall);
      if (idleTimer) clearTimeout(idleTimer);
      client.Page.removeListener?.("loadEventFired", onLoad);
      client.Network.removeListener?.("requestWillBeSent", onReq);
      client.Network.removeListener?.("loadingFinished", onDone);
      client.Network.removeListener?.("loadingFailed", onDone);
    };
    client.Page.loadEventFired(onLoad);
    client.Network.requestWillBeSent(onReq);
    client.Network.loadingFinished(onDone);
    client.Network.loadingFailed(onDone);
    armIdle();
  });
}

function mapKey(key: string): { key: string; code: string; vk: number; text?: string } {
  const map: Record<string, { key: string; code: string; vk: number; text?: string }> = {
    Enter: { key: "Enter", code: "Enter", vk: 13, text: "\r" },
    Tab: { key: "Tab", code: "Tab", vk: 9 },
    Escape: { key: "Escape", code: "Escape", vk: 27 },
    Backspace: { key: "Backspace", code: "Backspace", vk: 8 },
    ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", vk: 37 },
    ArrowUp: { key: "ArrowUp", code: "ArrowUp", vk: 38 },
    ArrowRight: { key: "ArrowRight", code: "ArrowRight", vk: 39 },
    ArrowDown: { key: "ArrowDown", code: "ArrowDown", vk: 40 },
    Space: { key: " ", code: "Space", vk: 32, text: " " }
  };
  if (map[key]) return map[key];
  if (key.length === 1) {
    return { key, code: `Key${key.toUpperCase()}`, vk: key.toUpperCase().charCodeAt(0), text: key };
  }
  return { key, code: key, vk: 0 };
}

export async function launchBrowser(opts: LaunchOptions = {}): Promise<{
  client: CDPClient;
  chrome: LaunchedChrome | null;
  close: () => Promise<void>;
}> {
  const viewport = opts.viewport ?? { width: 1280, height: 900 };
  let chrome: LaunchedChrome | null = null;
  let port = opts.port;

  if (!port) {
    const { launch } = await import("chrome-launcher");
    const headless = opts.headless !== false;
    const flags = [...DEFAULT_FLAGS];
    if (!headless) {
      const idx = flags.indexOf("--headless=new");
      if (idx >= 0) flags.splice(idx, 1);
    }
    if (opts.extraFlags) flags.push(...opts.extraFlags);
    chrome = await launch({
      chromeFlags: flags,
      ignoreDefaultFlags: false
    });
    port = chrome.port;
  }

  const CDPMod = (await import("chrome-remote-interface")).default;
  const client: CDPClient = await CDPMod({ port });
  await client.Emulation.setDeviceMetricsOverride({
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: false
  });

  return {
    client,
    chrome,
    close: async () => {
      try {
        await client.close();
      } catch {
        // ignore
      }
      if (chrome) {
        try {
          await chrome.kill();
        } catch {
          // ignore
        }
      }
    }
  };
}

export async function withPage<T>(
  opts: LaunchOptions,
  fn: (page: CdpPage) => Promise<T>
): Promise<T> {
  const session = await launchBrowser(opts);
  try {
    const page = await CdpPage.create(session.client, opts.viewport ?? { width: 1280, height: 900 });
    return await fn(page);
  } finally {
    await session.close();
  }
}
