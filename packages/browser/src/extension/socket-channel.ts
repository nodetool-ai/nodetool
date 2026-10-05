/**
 * Client side of the native-messaging bridge: an {@link ExtensionChannel} over
 * the unix socket the native host listens on. The backend, the CLI and the
 * Dreamina provider all reach the user's Chrome through this one path.
 */

import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { bridgeSocketDir, bridgePipeName } from "./bridge-paths.js";
import type { ExtensionChannel } from "./client.js";
import { parseExtensionFrame, type ExtensionFrame, type ExtensionHostToExtFrame } from "./protocol.js";

/** Overrides socket discovery with an explicit path. */
const SOCKET_ENV = "NODETOOL_BROWSER_BRIDGE_SOCKET";

export const BRIDGE_UNAVAILABLE_MESSAGE =
  "The NodeTool browser bridge is not running. Install the native host with `nodetool extension install`, " +
  "then load the NodeTool extension in Chrome and reload it so it connects.";

/** Socket paths of running hosts, newest first. */
export function listBridgeSockets(): string[] {
  const explicit = process.env[SOCKET_ENV];
  if (explicit) return [explicit];
  if (process.platform === "win32") return [bridgePipeName()];
  const dir = bridgeSocketDir();
  let names: string[];
  try {
    names = fs.readdirSync(dir).filter((name) => name.endsWith(".sock"));
  } catch {
    return [];
  }
  return names
    .map((name) => path.join(dir, name))
    .map((file) => ({ file, mtime: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .map((entry) => entry.file);
}

function connect(socketPath: string): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(socketPath);
    socket.once("connect", () => resolve(socket));
    socket.once("error", reject);
  });
}

/** Connect to the newest live host, removing the sockets of dead ones. */
async function connectToHost(): Promise<net.Socket> {
  for (const socketPath of listBridgeSockets()) {
    try {
      return await connect(socketPath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ECONNREFUSED" && process.platform !== "win32") {
        fs.rmSync(socketPath, { force: true });
      }
    }
  }
  throw new Error(BRIDGE_UNAVAILABLE_MESSAGE);
}

/** Whether a native host is accepting connections right now. */
export async function isBridgeAvailable(): Promise<boolean> {
  try {
    (await connectToHost()).destroy();
    return true;
  } catch {
    return false;
  }
}

/**
 * A channel that connects on creation. Frames sent before the connection is up
 * are buffered. A failed connection, or a later disconnect, reaches the handler
 * as an `error` frame, which makes pending attaches and commands reject.
 */
export function createSocketChannel(): ExtensionChannel {
  let handler: ((frame: ExtensionFrame) => void) | null = null;
  let pendingError: ExtensionFrame | null = null;
  let socket: net.Socket | null = null;
  let closed = false;
  let busy = true;
  const outbox: string[] = [];

  const emit = (frame: ExtensionFrame): void => {
    if (handler) handler(frame);
    else if (frame.kind === "error") pendingError = frame;
  };

  void connectToHost().then(
    (connected) => {
      if (closed) {
        connected.destroy();
        return;
      }
      socket = connected;
      // An idle bridge connection must not keep the host process alive.
      if (!busy) connected.unref();
      let buffered = "";
      connected.setEncoding("utf8");
      connected.on("data", (text: string) => {
        buffered += text;
        for (let newline = buffered.indexOf("\n"); newline >= 0; newline = buffered.indexOf("\n")) {
          const frame = parseExtensionFrame(buffered.slice(0, newline));
          buffered = buffered.slice(newline + 1);
          if (frame) emit(frame);
        }
      });
      connected.on("error", () => undefined);
      connected.on("close", () => {
        if (!closed) emit({ kind: "error", message: "Extension connection closed" });
      });
      for (const line of outbox.splice(0)) connected.write(line);
    },
    (error: unknown) => {
      emit({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  );

  return {
    send(frame: ExtensionHostToExtFrame): void {
      const line = `${JSON.stringify(frame)}\n`;
      if (socket) socket.write(line);
      else outbox.push(line);
    },
    onMessage(cb: (frame: ExtensionFrame) => void): void {
      handler = cb;
      if (pendingError) {
        const error = pendingError;
        pendingError = null;
        cb(error);
      }
    },
    setBusy(next: boolean): void {
      busy = next;
      if (next) socket?.ref();
      else socket?.unref();
    },
    close(): void {
      closed = true;
      socket?.destroy();
    }
  };
}
