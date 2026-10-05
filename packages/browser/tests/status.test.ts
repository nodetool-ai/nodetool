/**
 * `browser_status` — the question an agent asks before it spends a 30-second
 * attach timeout finding out nobody loaded the extension.
 *
 * It is the one browser action that answers without opening a session, so it
 * is also the one that can be checked without a Chrome: everything here runs
 * against the transport resolution and the native host's socket, with no page
 * in existence.
 */

import { afterEach, describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { browserStatus } from "../src/actions.js";
import { NativeHost } from "../src/extension/native-host.js";

const ENV_KEYS = ["NODETOOL_BROWSER_TRANSPORT", "NODETOOL_BROWSER_BRIDGE_SOCKET"];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const cleanup: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  for (const fn of cleanup.splice(0)) await fn();
});

describe("browserStatus", () => {
  it("reports the local transport, and how to reach the signed-in browser", async () => {
    delete process.env["NODETOOL_BROWSER_TRANSPORT"];

    const status = await browserStatus();

    expect(status.transport).toBe("local");
    expect(status.session_open).toBe(false);
    // Nothing was asked of the extension, so nothing is claimed about it.
    expect(status.extension_connected).toBeNull();
    expect(status.hint).toContain("transport:'extension'");
  });

  it("says nobody is connected when no native host runs", async () => {
    process.env["NODETOOL_BROWSER_TRANSPORT"] = "extension";
    process.env["NODETOOL_BROWSER_BRIDGE_SOCKET"] = path.join(tmpdir(), "nt-missing.sock");

    const status = await browserStatus();

    expect(status.transport).toBe("extension");
    expect(status.extension_connected).toBe(false);
    expect(status.hint).toContain("nodetool extension install");
  });

  it("reports a connected extension with nothing left to warn about", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "nt-status-"));
    const socketPath = path.join(dir, "host.sock");
    const host = new NativeHost({ input: new PassThrough(), output: new PassThrough(), socketPath });
    await host.start();
    cleanup.push(() => host.close(), () => rmSync(dir, { recursive: true, force: true }));
    process.env["NODETOOL_BROWSER_TRANSPORT"] = "extension";
    process.env["NODETOOL_BROWSER_BRIDGE_SOCKET"] = socketPath;

    const status = await browserStatus();

    expect(status.extension_connected).toBe(true);
    expect(status.hint).toBeNull();
  });
});
