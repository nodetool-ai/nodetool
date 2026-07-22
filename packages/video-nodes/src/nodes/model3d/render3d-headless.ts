/**
 * Node-side driver for `nodetool.model3d.RenderToImage`.
 *
 * The backend has no WebGL, so it launches a headless Chromium, injects the
 * self-contained render bundle (`dist/render3d-page.js`, built by
 * `scripts/bundle-render3d-page.mjs`), and calls `__nodetoolRenderGlb` over
 * CDP. SwiftShader flags keep WebGL working on GPU-less servers.
 *
 * Chrome discovery follows the automation nodes: `CHROME_PATH` when set,
 * otherwise chrome-launcher's platform search. Everything here is
 * lazy-imported so merely registering the node never requires Chrome.
 */

import { readFile } from "node:fs/promises";
import { resolvePackageAssetPath } from "@nodetool-ai/config";
import type { Render3DOptions } from "./render3d-core.js";

const RENDER_TIMEOUT_MS = 120_000;

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
    enable(): Promise<unknown>;
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

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `RenderToImage: ${label} timed out after ${RENDER_TIMEOUT_MS}ms`
          )
        ),
      RENDER_TIMEOUT_MS
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
 * Render GLB bytes to PNG bytes in a fresh headless Chromium. One Chrome per
 * call keeps the node stateless; launch cost (~1s) is negligible next to a
 * typical workflow's model-generation steps.
 */
export async function renderGlbHeadless(
  glb: Uint8Array,
  options: Render3DOptions
): Promise<Uint8Array> {
  const bundle = await loadRenderBundle();

  const { launch } = await import("chrome-launcher");
  const chrome = await launch({
    chromeFlags: CHROME_FLAGS,
    chromePath: process.env.CHROME_PATH || undefined
  });

  let client: CdpClient | null = null;
  try {
    client = await connectCdp(chrome.port);
    await client.Runtime.enable();

    const injected = await client.Runtime.evaluate({ expression: bundle });
    throwOnException(injected, "inject bundle");

    const glbBase64 = Buffer.from(glb).toString("base64");
    const call = await withTimeout(
      client.Runtime.evaluate({
        expression: `globalThis.__nodetoolRenderGlb(${JSON.stringify(
          glbBase64
        )}, ${JSON.stringify(JSON.stringify(options))})`,
        awaitPromise: true,
        returnByValue: true
      }),
      "render"
    );
    throwOnException(call, "render");

    const pngBase64 = call.result?.value;
    if (typeof pngBase64 !== "string" || pngBase64.length === 0) {
      throw new Error("RenderToImage: headless render returned no image data");
    }
    return new Uint8Array(Buffer.from(pngBase64, "base64"));
  } finally {
    if (client) {
      try {
        await client.close();
      } catch {
        // Chrome is being killed right after; a failed CDP close is harmless.
      }
    }
    try {
      await chrome.kill();
    } catch {
      // Process may already be gone.
    }
  }
}
