/**
 * Headless Chrome screenshots, taken on this machine.
 *
 * `take_screenshot` used to need a `BROWSER_URL` service, so on a normal
 * install — desktop app, CLI, dev checkout — it could not take a screenshot at
 * all, even with Chrome installed. This drives a local Chrome over CDP
 * instead, with the same lazy import the `lib.browser.*` nodes use: nothing is
 * loaded, and no browser is required, until a screenshot is actually taken.
 */

/** The `chrome-remote-interface` client — its published types are `any`. */
type CDPClient = any;

const CHROME_FLAGS = [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--hide-scrollbars",
  "--mute-audio"
];

export interface ScreenshotOptions {
  fullPage?: boolean;
  width?: number;
  height?: number;
  /** Milliseconds allowed for navigation before the page is captured as-is. */
  timeoutMs?: number;
}

/**
 * Navigate a freshly launched Chrome to `url` and return the PNG bytes.
 *
 * A navigation that never fires `load` is captured anyway once `timeoutMs`
 * elapses — a screenshot of a half-loaded page answers more than an error.
 */
export async function captureScreenshot(
  url: string,
  opts: ScreenshotOptions = {}
): Promise<Uint8Array> {
  const width = opts.width ?? 1280;
  const height = opts.height ?? 900;
  const timeoutMs = opts.timeoutMs ?? 30_000;

  const { launch } = await import("chrome-launcher");
  const chrome = await launch({
    chromeFlags: [...CHROME_FLAGS, `--window-size=${width},${height}`],
    // The sandbox container points CHROME_PATH at /usr/bin/chromium; locally,
    // chrome-launcher finds the installed browser itself.
    chromePath: process.env.CHROME_PATH || undefined
  });

  let client: CDPClient | null = null;
  try {
    const CDP = (await import("chrome-remote-interface")).default;
    client = await CDP({ port: chrome.port });
    const { Page, Emulation } = client;
    await Page.enable();
    await Emulation.setDeviceMetricsOverride({
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false
    });

    const loaded = Page.loadEventFired();
    const nav = await Page.navigate({ url });
    // Without this a DNS failure or a refused connection is captured as
    // Chrome's own error page and handed back as a successful screenshot.
    if (nav.errorText) {
      throw new Error(`Could not load ${url}: ${nav.errorText}`);
    }
    await raceTimeout(loaded, timeoutMs);

    const params: Record<string, unknown> = { format: "png" };
    if (opts.fullPage) {
      const metrics = await Page.getLayoutMetrics();
      const content = metrics.cssContentSize ?? metrics.contentSize;
      params["captureBeyondViewport"] = true;
      params["clip"] = {
        x: 0,
        y: 0,
        width: Math.ceil(content.width),
        height: Math.ceil(content.height),
        scale: 1
      };
    }
    const { data } = await Page.captureScreenshot(params);
    return Uint8Array.from(Buffer.from(data as string, "base64"));
  } finally {
    if (client) {
      try {
        await client.close();
      } catch {
        // The client is being discarded with the browser below.
      }
    }
    try {
      await chrome.kill();
    } catch {
      // Chrome already exited.
    }
  }
}

/** Resolve when `promise` settles or `ms` elapses, leaving no pending timer. */
async function raceTimeout(promise: Promise<unknown>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(resolve, ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
