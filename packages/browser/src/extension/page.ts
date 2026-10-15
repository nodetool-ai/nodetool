/**
 * Builds a {@link CdpPage} backed by the Chrome extension instead of a
 * locally-launched Chrome.
 *
 * The single seam from the design: feed the *existing* `CdpPage.create(client,
 * viewport)` a synthetic `client` whose namespaced methods tunnel CDP over the
 * extension WebSocket. Everything downstream (element indexing, screenshots, the
 * action loop) is reused verbatim.
 */

import { CdpPage } from "../cdp-page.js";
import {
  ExtensionCdpClient,
  type ExtensionCdpClientApi,
  type ExtensionChannel,
  type ExtensionCdpClientOptions
} from "./client.js";

/** Default viewport for the extension-driven page. */
const DEFAULT_VIEWPORT = { width: 1280, height: 900 };

export interface ExtensionPageHandle {
  /** The transport-agnostic page driven by the action loop. */
  page: CdpPage;
  /**
   * The synthetic CDP client behind {@link page}. Exposed so capture_media can
   * issue raw `Network.getResponseBody` calls (the in-page-fetch rungs use the
   * page directly and don't need this).
   */
  client: ExtensionCdpClientApi;
  /** Detach the debugger and tear down the transport. */
  close(): Promise<void>;
}

interface CreateExtensionPageOptions extends ExtensionCdpClientOptions {
  viewport?: { width: number; height: number };
  signal?: AbortSignal;
  /** Attach a tab whose URL contains this text instead of the active tab. */
  urlMatch?: string;
}

/**
 * Attach to the extension's active tab and return a ready {@link CdpPage}.
 *
 * @param transport A frame channel, or `undefined` to connect to the native
 *   messaging host's socket.
 */
export async function createExtensionPage(
  transport?: ExtensionChannel,
  options: CreateExtensionPageOptions = {}
): Promise<ExtensionPageHandle> {
  options.signal?.throwIfAborted();
  const viewport = options.viewport ?? DEFAULT_VIEWPORT;
  const clientOptions: ExtensionCdpClientOptions = { sessionId: options.sessionId };
  if (options.commandTimeoutMs !== undefined) clientOptions.commandTimeoutMs = options.commandTimeoutMs;
  const cdp = new ExtensionCdpClient(transport, clientOptions);

  const abort = (): void => { cdp.detach("Cancelled"); void cdp.close(); };
  options.signal?.addEventListener("abort", abort, { once: true });
  let attached = false;
  try {
    await cdp.attach(undefined, options.urlMatch);
    attached = true;
    await cdp.checkHealth();

    const page = await CdpPage.create(cdp.client, viewport);
    await cdp.client.Emulation.setDeviceMetricsOverride({
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: false
    });

    return {
      page,
      client: cdp.client,
      close: async () => {
        options.signal?.removeEventListener("abort", abort);
        cdp.detach();
        await cdp.close();
      }
    };
  } catch (err) {
    options.signal?.removeEventListener("abort", abort);
    if (attached) cdp.detach();
    await cdp.close();
    throw err instanceof Error ? err : new Error(String(err));
  }
}
