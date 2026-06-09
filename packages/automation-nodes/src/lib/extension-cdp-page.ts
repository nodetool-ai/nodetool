/**
 * Builds a {@link CdpPage} backed by the Chrome extension instead of a
 * locally-launched Chrome.
 *
 * The single seam from the design: feed the *existing* `CdpPage.create(client,
 * viewport)` a synthetic `client` whose namespaced methods tunnel CDP over the
 * extension WebSocket. Everything downstream (element indexing, screenshots, the
 * action loop) is reused verbatim.
 */

import { CdpPage } from "./cdp-page.js";
import {
  ExtensionCdpClient,
  type ExtensionCdpClientApi,
  type ExtensionChannel,
  type ExtensionCdpClientOptions
} from "./extension-cdp-client.js";

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

export interface CreateExtensionPageOptions extends ExtensionCdpClientOptions {
  viewport?: { width: number; height: number };
}

/**
 * Attach to the extension's active tab and return a ready {@link CdpPage}.
 *
 * @param transport In-process {@link ExtensionChannel} or a `ws://` URL (or
 *   `undefined` to use `NODETOOL_EXTENSION_WS_URL`).
 */
export async function createExtensionPage(
  transport?: ExtensionChannel | string,
  options: CreateExtensionPageOptions = {}
): Promise<ExtensionPageHandle> {
  const viewport = options.viewport ?? DEFAULT_VIEWPORT;
  const cdp = new ExtensionCdpClient(transport, { sessionId: options.sessionId });

  let attached = false;
  try {
    await cdp.attach();
    attached = true;

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
        cdp.detach();
        await cdp.close();
      }
    };
  } catch (err) {
    if (attached) cdp.detach();
    await cdp.close();
    throw err instanceof Error ? err : new Error(String(err));
  }
}
