/**
 * Node-side driver for `nodetool.model3d.RenderToImage`.
 *
 * The backend has no WebGL, so it launches a headless Chromium, injects the
 * self-contained render bundle (`dist/render3d-page.js`, built by
 * `scripts/bundle-render3d-page.mjs`), and calls `__nodetoolRenderGlbFrames`
 * over CDP. SwiftShader flags keep WebGL working on GPU-less servers. Later
 * renders reuse that browser until it has been idle for a minute.
 *
 * Chrome discovery follows the automation nodes: `CHROME_PATH` when set,
 * otherwise chrome-launcher's platform search. Everything here is
 * lazy-imported so merely registering the node never requires Chrome.
 */

import { readFile } from "node:fs/promises";
import { resolvePackageAssetPath } from "@nodetool-ai/config";
import {
  renderFrameFromRender3DOptions,
  sessionOptionsFromRender3DOptions,
  type Model3DRenderFrame,
  type Model3DSessionOptions,
  type Render3DOptions
} from "./render3d-core.js";
import { isNonEmptyString } from "@nodetool-ai/node-sdk";

/** Budget for the first frame, which pays the model load and the GL warm-up. */
const RENDER_TIMEOUT_MS = 120_000;
/** Added to the budget for every frame after the first. */
const EXTRA_FRAME_TIMEOUT_MS = 30_000;

/** How long to keep trying to attach to the debug port before giving up. */
const CDP_CONNECT_TIMEOUT_MS = 10_000;
/** Gap between attach attempts. */
const CDP_CONNECT_RETRY_MS = 100;

const CHROME_FLAGS = [
  "--headless=new",
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  // Software WebGL: ANGLE on SwiftShader, explicitly allowed (Chrome 137+
  // refuses software WebGL in headless without the unsafe opt-in).
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--hide-scrollbars",
  "--mute-audio"
];

interface RuntimeEvaluateResult {
  result?: { type?: string; value?: unknown };
  exceptionDetails?: {
    text?: string;
    exception?: { description?: string; value?: unknown };
  };
}

interface CdpClient {
  Runtime: {
    /** CDP commands with no return parameters resolve to an empty object. */
    enable(): Promise<object>;
    evaluate(params: {
      expression: string;
      awaitPromise?: boolean;
      returnByValue?: boolean;
    }): Promise<RuntimeEvaluateResult>;
  };
  close(): Promise<void>;
}

let bundlePromise: Promise<string> | null = null;

/** Load (and cache) the self-contained render page bundle. */
async function loadRenderBundle(): Promise<string> {
  if (!bundlePromise) {
    bundlePromise = (async () => {
      const path = resolvePackageAssetPath(
        { pkg: "@nodetool-ai/video-nodes", path: "render3d-page.js" },
        import.meta.url
      );
      return readFile(path, "utf-8");
    })().catch((err) => {
      bundlePromise = null;
      throw err;
    });
  }
  return bundlePromise;
}

function throwOnException(
  result: RuntimeEvaluateResult,
  stage: string
): void {
  if (!result.exceptionDetails) return;
  const exception = result.exceptionDetails.exception;
  const detail =
    exception?.description ??
    (exception?.value !== undefined ? String(exception.value) : undefined) ??
    result.exceptionDetails.text ??
    "unknown error";
  throw new Error(`RenderToImage (${stage}): ${detail}`);
}

async function withTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs: number
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(`RenderToImage: ${label} timed out after ${timeoutMs}ms`)
        ),
      timeoutMs
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Attach to a freshly launched Chrome's debug port, retrying while it refuses.
 *
 * `chrome-launcher` resolves as soon as the port accepts a TCP connection, but
 * `chrome-remote-interface` then issues an HTTP request to `/json/list` that a
 * still-initializing Chrome refuses outright. A single attempt loses that race
 * on a loaded machine — it turned up as an `ECONNREFUSED` on CI while several
 * other Chrome-driving suites were running — so poll until the endpoint is
 * actually serving.
 *
 * Exported for tests.
 */
export async function connectCdp(
  port: number,
  { timeoutMs = CDP_CONNECT_TIMEOUT_MS, retryMs = CDP_CONNECT_RETRY_MS } = {}
): Promise<CdpClient> {
  const CDP = (await import("chrome-remote-interface")).default;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  for (;;) {
    try {
      // SAFETY: `CdpClient` is the `Runtime.enable`/`Runtime.evaluate`/`close`
      // subset this renderer drives; chrome-remote-interface types every
      // domain dynamically.
      return (await CDP({ port })) as unknown as CdpClient;
    } catch (err) {
      lastError = err;
      // Stop once another wait would take us past the deadline, so the loop
      // never overruns the budget it was given.
      if (Date.now() + retryMs >= deadline) break;
      await new Promise((resolve) => setTimeout(resolve, retryMs));
    }
  }

  const detail =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `RenderToImage: could not attach to headless Chrome on port ${port} ` +
      `within ${timeoutMs}ms: ${detail}`,
    { cause: lastError }
  );
}

/**
 * Launch Chrome, retrying once after a beat. `chrome-launcher` rejects with
 * its port poll's raw error (an `ECONNREFUSED`) when Chromium is too slow to
 * open its debug port on a loaded machine — the same transient race the CDP
 * attach retry above covers, one step earlier. A machine that cannot run
 * Chrome at all fails the same way twice and the second error propagates.
 *
 * Exported for tests.
 */
export async function launchChromeWithRetry<T>(
  launch: () => Promise<T>,
  retryDelayMs = 1_000
): Promise<T> {
  try {
    return await launch();
  } catch {
    // The first failure leaves any half-started Chrome behind; a fresh launch
    // picks a fresh port, so the two never contend.
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    return await launch();
  }
}

/** How long an idle render browser stays open before it closes. */
const IDLE_CLOSE_MS = 60_000;

/** A launched Chrome with the render bundle already injected. */
interface RenderBrowser {
  readonly chrome: {
    pid?: number;
    port: number;
    process?: EventLoopHandle;
    kill(): void;
  };
  readonly client: CdpClient;
  readonly chromePath: string | undefined;
  readonly onExit: () => void;
}

interface EventLoopHandle {
  ref(): void;
  unref(): void;
}

/**
 * Hold the event loop only while a render runs. An idle browser must not keep
 * the process alive: a CLI run would otherwise wait for the idle timeout.
 */
function holdEventLoop(browser: RenderBrowser, hold: boolean): void {
  // SAFETY: chrome-remote-interface keeps its `ws` socket on `_ws`, and ws
  // keeps the net.Socket on `_socket`; both are absent once the client closes.
  const socket = (
    browser.client as unknown as { _ws?: { _socket?: EventLoopHandle | null } }
  )._ws?._socket;
  for (const handle of [browser.chrome.process, socket]) {
    if (hold) {
      handle?.ref();
    } else {
      handle?.unref();
    }
  }
}

let browserPromise: Promise<RenderBrowser> | null = null;
let activeRenders = 0;
let idleTimer: NodeJS.Timeout | undefined;

async function launchRenderBrowser(
  chromePath: string | undefined
): Promise<RenderBrowser> {
  const bundle = await loadRenderBundle();
  const { launch } = await import("chrome-launcher");
  const chrome = await launchChromeWithRetry(() =>
    launch({ chromeFlags: CHROME_FLAGS, chromePath })
  );
  // An idle browser must not outlive the process: the idle timer is unref'd.
  const onExit = () => {
    try {
      chrome.kill();
    } catch {
      // Process may already be gone.
    }
  };
  process.once("exit", onExit);
  try {
    const client = await connectCdp(chrome.port);
    await client.Runtime.enable();
    const injected = await client.Runtime.evaluate({ expression: bundle });
    throwOnException(injected, "inject bundle");
    return { chrome, client, chromePath, onExit };
  } catch (err) {
    process.removeListener("exit", onExit);
    onExit();
    throw err;
  }
}

async function closeRenderBrowser(browser: RenderBrowser): Promise<void> {
  process.removeListener("exit", browser.onExit);
  try {
    await browser.client.close();
  } catch {
    // Chrome is being killed right after; a failed CDP close is harmless.
  }
  try {
    await browser.chrome.kill();
  } catch {
    // Process may already be gone.
  }
}

/** Drop the shared browser so the next render launches a new one. */
function discardRenderBrowser(promise: Promise<RenderBrowser>): void {
  if (browserPromise !== promise) return;
  browserPromise = null;
  void promise.then(closeRenderBrowser, () => undefined);
}

/**
 * Close the shared render browser now. Exported for tests and shutdown;
 * renders otherwise close it after {@link IDLE_CLOSE_MS} without work.
 */
export async function closeHeadlessRenderer(): Promise<void> {
  clearTimeout(idleTimer);
  const promise = browserPromise;
  browserPromise = null;
  if (promise) {
    await promise.then(closeRenderBrowser, () => undefined);
  }
}

/** A failure of the page or the browser, not of the model being rendered. */
class RenderBrowserError extends Error {}

async function renderInBrowser(
  browser: RenderBrowser,
  glb: Uint8Array,
  options: Model3DSessionOptions,
  frames: readonly Model3DRenderFrame[]
): Promise<Uint8Array[]> {
  const glbBase64 = Buffer.from(glb).toString("base64");
  let call: RuntimeEvaluateResult;
  try {
    call = await withTimeout(
      browser.client.Runtime.evaluate({
        expression: `globalThis.__nodetoolRenderGlbFrames(${JSON.stringify(
          glbBase64
        )}, ${JSON.stringify(JSON.stringify(options))}, ${JSON.stringify(
          JSON.stringify(frames)
        )})`,
        awaitPromise: true,
        returnByValue: true
      }),
      "render",
      RENDER_TIMEOUT_MS + EXTRA_FRAME_TIMEOUT_MS * (frames.length - 1)
    );
  } catch (err) {
    throw new RenderBrowserError(
      err instanceof Error ? err.message : String(err),
      { cause: err }
    );
  }
  throwOnException(call, "render");

  const pngsBase64 = call.result?.value;
  if (!Array.isArray(pngsBase64) || pngsBase64.length !== frames.length) {
    throw new Error(
      `RenderToImage: headless render returned ${
        Array.isArray(pngsBase64) ? pngsBase64.length : "no"
      } images for ${frames.length} frames`
    );
  }
  return pngsBase64.map((png) => {
    if (!isNonEmptyString(png)) {
      throw new Error("RenderToImage: headless render returned no image data");
    }
    return new Uint8Array(Buffer.from(png, "base64"));
  });
}

/**
 * Render one session's worth of frames: one model load, one PNG per frame.
 *
 * Renders share one headless Chromium with the bundle already injected.
 * Launching Chrome costs about half a second, and the first SwiftShader frame
 * in a new browser about two more, so a browser per call made every render
 * take seconds. The browser closes after {@link IDLE_CLOSE_MS} without work.
 * A browser that fails or times out is closed, and a render on a browser that
 * died while idle retries once on a new one.
 */
export async function renderGlbFramesHeadless(
  glb: Uint8Array,
  options: Model3DSessionOptions,
  frames: readonly Model3DRenderFrame[]
): Promise<Uint8Array[]> {
  if (frames.length === 0) return [];
  const chromePath = process.env.CHROME_PATH || undefined;

  clearTimeout(idleTimer);
  activeRenders += 1;
  try {
    for (let attempt = 0; ; attempt += 1) {
      let promise = browserPromise;
      if (promise && (await promise.catch(() => null))?.chromePath !== chromePath) {
        discardRenderBrowser(promise);
        promise = null;
      }
      const launched = !promise;
      if (!promise) {
        promise = launchRenderBrowser(chromePath);
        browserPromise = promise;
      }
      let browser: RenderBrowser;
      try {
        browser = await promise;
      } catch (err) {
        discardRenderBrowser(promise);
        throw err;
      }
      holdEventLoop(browser, true);
      try {
        return await renderInBrowser(browser, glb, options, frames);
      } catch (err) {
        if (!(err instanceof RenderBrowserError)) throw err;
        discardRenderBrowser(promise);
        if (launched || attempt > 0) {
          throw new Error(err.message, { cause: err.cause });
        }
      }
    }
  } finally {
    activeRenders -= 1;
    if (activeRenders === 0 && browserPromise) {
      void browserPromise.then(
        (browser) => {
          if (activeRenders === 0) holdEventLoop(browser, false);
        },
        () => undefined
      );
      idleTimer = setTimeout(() => void closeHeadlessRenderer(), IDLE_CLOSE_MS);
      idleTimer.unref();
    }
  }
}

/** Render GLB bytes to PNG bytes: the one-frame case of the above. */
export async function renderGlbHeadless(
  glb: Uint8Array,
  options: Render3DOptions
): Promise<Uint8Array> {
  const [png] = await renderGlbFramesHeadless(
    glb,
    sessionOptionsFromRender3DOptions(options),
    [renderFrameFromRender3DOptions(options)]
  );
  return png;
}
