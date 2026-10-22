import { afterEach, beforeEach, describe, expect, it } from "vitest";
import net from "node:net";
import path from "node:path";
import { chmodSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { bridgeSocketDir } from "../src/extension/bridge-paths.js";
import { listBridgeSockets } from "../src/extension/socket-channel.js";

describe.skipIf(process.platform === "win32")("bridge socket discovery", () => {
  let base: string;
  let previousTmp: string | undefined;
  let server: net.Server | undefined;

  beforeEach(() => {
    base = mkdtempSync(path.join(tmpdir(), "nt-bridge-own-"));
    previousTmp = process.env.TMPDIR;
    process.env.TMPDIR = base;
    delete process.env.NODETOOL_BROWSER_BRIDGE_SOCKET;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = undefined;
    if (previousTmp === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previousTmp;
    rmSync(base, { recursive: true, force: true });
  });

  async function listen(socketPath: string): Promise<void> {
    server = net.createServer();
    await new Promise<void>((resolve) => server!.listen(socketPath, resolve));
  }

  it("lists a socket in a private directory", async () => {
    const dir = bridgeSocketDir();
    mkdirSync(dir, { mode: 0o700 });
    const socketPath = path.join(dir, "1.sock");
    await listen(socketPath);
    chmodSync(socketPath, 0o600);
    expect(listBridgeSockets()).toEqual([socketPath]);
  });

  it("ignores a directory others can write, as a squatter would leave it", async () => {
    const dir = bridgeSocketDir();
    mkdirSync(dir);
    chmodSync(dir, 0o777);
    const socketPath = path.join(dir, "a.sock");
    await listen(socketPath);
    chmodSync(socketPath, 0o777);
    expect(listBridgeSockets()).toEqual([]);
  });
});
