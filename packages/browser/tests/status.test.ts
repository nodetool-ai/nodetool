/**
 * `browser_status` — the question an agent asks before it spends a 30-second
 * attach timeout finding out nobody clicked "Attach to this tab".
 *
 * It is the one browser action that answers without opening a session, so it
 * is also the one that can be checked without a Chrome: everything here runs
 * against the transport resolution and the extension-channel seam, with no
 * page in existence.
 */

import { afterEach, describe, expect, it } from "vitest";
import { browserStatus } from "../src/actions.js";
import { setExtensionChannelProvider } from "../src/extension/channel.js";
import type { ExtensionChannel } from "../src/extension/client.js";

const ENV_KEYS = ["NODETOOL_BROWSER_TRANSPORT", "NODETOOL_EXTENSION_WS_URL"];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

/** A channel that reports a connection state and relays nothing. */
function channel(connected: boolean): ExtensionChannel {
  return {
    send: () => undefined,
    onMessage: () => undefined,
    close: () => undefined,
    connected
  };
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  setExtensionChannelProvider(null);
});

describe("browserStatus", () => {
  it("reports the local transport, and how to reach the signed-in browser", async () => {
    delete process.env["NODETOOL_BROWSER_TRANSPORT"];
    delete process.env["NODETOOL_EXTENSION_WS_URL"];

    const status = await browserStatus();

    expect(status.transport).toBe("local");
    expect(status.session_open).toBe(false);
    // Nothing was asked of the extension, so nothing is claimed about it.
    expect(status.extension_connected).toBeNull();
    expect(status.hint).toContain("transport:'extension'");
  });

  it("says nobody is attached when the bridge holds no socket", async () => {
    process.env["NODETOOL_BROWSER_TRANSPORT"] = "extension";
    setExtensionChannelProvider(() => channel(false));

    const status = await browserStatus();

    expect(status.transport).toBe("extension");
    expect(status.extension_connected).toBe(false);
    expect(status.hint).toContain("Attach to this tab");
  });

  it("reports an attached extension with nothing left to warn about", async () => {
    process.env["NODETOOL_BROWSER_TRANSPORT"] = "extension";
    setExtensionChannelProvider(() => channel(true));

    const status = await browserStatus();

    expect(status.extension_connected).toBe(true);
    expect(status.hint).toBeNull();
  });

  it("selects the extension from a configured ws url alone", async () => {
    delete process.env["NODETOOL_BROWSER_TRANSPORT"];
    process.env["NODETOOL_EXTENSION_WS_URL"] = "ws://localhost:7777/ws/extension";

    expect((await browserStatus()).transport).toBe("extension");
  });

  it("cannot answer for the extension outside the process holding the bridge", async () => {
    process.env["NODETOOL_BROWSER_TRANSPORT"] = "extension";
    setExtensionChannelProvider(null);

    // A CLI talking to /ws/extension over a URL would have to open a socket to
    // find out, so it reports "unknown" rather than "not connected".
    expect((await browserStatus()).extension_connected).toBeNull();
  });
});
