/**
 * The Chrome native messaging host for the NodeTool extension.
 *
 *   NodeTool extension ──stdio (length-prefixed JSON)── native host
 *                                                          │ unix socket, NDJSON
 *                                       backend / CLI / any local client
 *
 * Chrome starts one host per extension connection and ends it when the
 * connection closes, so a live socket always means a live extension. The host
 * multiplexes any number of clients onto the one extension:
 *
 *  - `cdp` ids are rewritten per client and restored on the `cdp_result`.
 *  - Attach requests acquire exclusive ownership in FIFO order.
 *  - Commands and events belong to that owner until detach or disconnect.
 *  - Heartbeat `ping` frames are answered here.
 */

import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import type { Readable, Writable } from "node:stream";
import { bridgeSocketPath } from "./bridge-paths.js";
import { NativeMessageDecoder, encodeNativeMessage } from "./native-framing.js";
import type { ExtensionFrame } from "./protocol.js";

type Frame = ExtensionFrame & Record<string, unknown>;

interface Client {
  id: number;
  socket: net.Socket;
  attached: boolean;
}

export interface NativeHostOptions {
  /** Messages from Chrome. Defaults to `process.stdin`. */
  input?: Readable;
  /** Messages to Chrome. Defaults to `process.stdout`. */
  output?: Writable;
  /** Socket path to listen on. Defaults to `NODETOOL_BROWSER_BRIDGE_SOCKET`, else `<tmp>/nodetool-browser-bridge-<user>/<pid>.sock`. */
  socketPath?: string;
  /** Called once when the host shuts down. */
  onClose?: () => void;
}

export class NativeHost {
  private readonly input: Readable;
  private readonly output: Writable;
  private readonly socketPath: string;
  private readonly onClose: (() => void) | undefined;
  private readonly server = net.createServer((socket) => this.onClient(socket));
  private readonly decoder = new NativeMessageDecoder();
  private readonly clients = new Map<number, Client>();
  /** Rewritten cdp id → the client and id it came from. */
  private readonly routes = new Map<number, { clientId: number; id: number }>();
  private owner: Client | null = null;
  private readonly waiting: Array<{ client: Client; frame: Frame }> = [];
  private releasing = false;
  private releaseTimer: ReturnType<typeof setTimeout> | undefined;
  private nextClientId = 1;
  private nextRouteId = 1;
  private closed = false;

  constructor(options: NativeHostOptions = {}) {
    this.input = options.input ?? process.stdin;
    this.output = options.output ?? process.stdout;
    this.socketPath =
      options.socketPath ?? process.env.NODETOOL_BROWSER_BRIDGE_SOCKET ?? bridgeSocketPath(process.pid);
    this.onClose = options.onClose;
  }

  /** Bind the socket and start reading from Chrome. Resolves once listening. */
  async start(): Promise<string> {
    if (process.platform !== "win32") {
      const dir = path.dirname(this.socketPath);
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      fs.chmodSync(dir, 0o700);
      fs.rmSync(this.socketPath, { force: true });
    }
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.socketPath, () => {
        this.server.off("error", reject);
        resolve();
      });
    });
    if (process.platform !== "win32") fs.chmodSync(this.socketPath, 0o600);

    this.input.on("data", (chunk: Buffer) => {
      try {
        for (const message of this.decoder.push(chunk)) this.fromChrome(message);
      } catch {
        // A malformed stream cannot be resynchronised: end the host.
        void this.close();
      }
    });
    this.input.on("end", () => void this.close());
    this.input.on("close", () => void this.close());
    return this.socketPath;
  }

  /** Close the socket, drop clients and remove the socket file. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.releaseTimer);
    for (const client of this.clients.values()) client.socket.destroy();
    this.clients.clear();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
    if (process.platform !== "win32") fs.rmSync(this.socketPath, { force: true });
    this.onClose?.();
  }

  private fromChrome(message: unknown): void {
    if (typeof message !== "object" || message === null) return;
    const frame = message as Frame;
    switch (frame.kind) {
      case "cdp_result": {
        const route = this.routes.get(frame.id);
        if (!route) return;
        this.routes.delete(frame.id);
        this.sendTo(route.clientId, { ...frame, id: route.id });
        return;
      }
      case "attached":
        if (this.owner) {
          this.owner.attached = true;
          this.sendTo(this.owner.id, frame);
        }
        return;
      case "detach":
      case "error":
        if (this.owner) this.sendTo(this.owner.id, frame);
        this.owner = null;
        clearTimeout(this.releaseTimer);
        this.releasing = false;
        this.attachNext();
        return;
      default:
        if (this.owner?.attached) this.sendTo(this.owner.id, frame);
    }
  }

  private onClient(socket: net.Socket): void {
    const client: Client = { id: this.nextClientId++, socket, attached: false };
    this.clients.set(client.id, client);
    let buffered = "";
    socket.setEncoding("utf8");
    socket.on("data", (text: string) => {
      buffered += text;
      for (let newline = buffered.indexOf("\n"); newline >= 0; newline = buffered.indexOf("\n")) {
        const line = buffered.slice(0, newline);
        buffered = buffered.slice(newline + 1);
        if (line.trim()) this.fromClient(client, line);
      }
    });
    socket.on("error", () => undefined);
    socket.on("close", () => this.onClientGone(client));
  }

  private fromClient(client: Client, line: string): void {
    let frame: Frame;
    try {
      frame = JSON.parse(line) as Frame;
    } catch {
      return;
    }
    switch (frame.kind) {
      case "ping":
        this.sendTo(client.id, { kind: "pong", ts: frame.ts });
        return;
      case "cdp": {
        if (client !== this.owner || !client.attached) {
          this.sendTo(client.id, { kind: "cdp_result", id: frame.id, error: { message: "Client does not own the browser tab" } });
          return;
        }
        const routeId = this.nextRouteId++;
        this.routes.set(routeId, { clientId: client.id, id: frame.id });
        this.toChrome({ ...frame, id: routeId });
        return;
      }
      case "attach":
        if (client === this.owner || this.waiting.some((entry) => entry.client === client)) return;
        this.waiting.push({ client, frame });
        this.attachNext();
        return;
      case "detach":
        this.release(client, typeof frame.reason === "string" ? frame.reason : undefined);
        return;
      default:
        if (client === this.owner && client.attached) this.toChrome(frame);
    }
  }

  private onClientGone(client: Client): void {
    this.clients.delete(client.id);
    for (const [routeId, route] of this.routes) {
      if (route.clientId === client.id) this.routes.delete(routeId);
    }
    this.release(client, "Client disconnected");
  }

  private release(client: Client, reason?: string): void {
    for (let i = this.waiting.length - 1; i >= 0; i--) {
      if (this.waiting[i].client === client) this.waiting.splice(i, 1);
    }
    if (client !== this.owner || this.releasing) return;
    this.releasing = true;
    client.attached = false;
    this.toChrome({ kind: "detach", reason });
    this.releaseTimer = setTimeout(() => {
      for (const entry of this.waiting.splice(0)) {
        this.sendTo(entry.client.id, { kind: "error", message: "Browser extension did not acknowledge tab release. Update the NodeTool extension and reconnect it." });
      }
    }, 5_000);
    this.releaseTimer.unref();
  }

  private attachNext(): void {
    if (this.owner || this.releasing) return;
    const next = this.waiting.shift();
    if (!next) return;
    this.owner = next.client;
    this.toChrome(next.frame);
  }

  private toChrome(frame: unknown): void {
    if (!this.closed) this.output.write(encodeNativeMessage(frame));
  }

  private sendTo(clientId: number, frame: unknown): void {
    this.clients.get(clientId)?.socket.write(`${JSON.stringify(frame)}\n`);
  }
}

/** Run the host on this process's stdio until Chrome closes the connection. */
export async function runNativeHost(): Promise<void> {
  const host = new NativeHost({ onClose: () => process.exit(0) });
  await host.start();
  process.on("SIGTERM", () => void host.close());
  process.on("SIGINT", () => void host.close());
}
