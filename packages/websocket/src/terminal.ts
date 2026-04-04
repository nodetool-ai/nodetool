/**
 * Terminal WebSocket handler.
 *
 * Spawns a real PTY-backed shell and relays I/O over a WebSocket connection
 * using a simple JSON protocol. Intended for local development only.
 *
 * Message protocol (JSON text frames):
 *
 * Client → Server:
 *   { type: "input",  data: string }         — raw keystrokes
 *   { type: "resize", cols: number, rows: number } — resize PTY
 *   { type: "ping" }                          — heartbeat
 *
 * Server → Client:
 *   { type: "output", data: string }          — shell output
 *   { type: "exit",   code: number }          — shell exited
 *   { type: "error",  message: string }       — non-fatal error
 *   { type: "pong",   ts: number }            — heartbeat reply
 */

import { createLogger } from "@nodetool/config";
import * as os from "node:os";

const log = createLogger("nodetool.terminal");

// node-pty is a native module; lazy-load so the rest of the server can start
// even when the addon is not compiled for the current platform.
let ptyModule: typeof import("node-pty") | null = null;

async function getPty(): Promise<typeof import("node-pty")> {
  if (!ptyModule) {
    ptyModule = await import("node-pty");
  }
  return ptyModule;
}

/** Resolve the shell binary for the current platform. */
function resolveShell(): { file: string; args: string[] } {
  if (os.platform() === "win32") {
    const shell = process.env["COMSPEC"] || "powershell.exe";
    return { file: shell, args: [] };
  }
  const shell = process.env["SHELL"] || "/bin/bash";
  return { file: shell, args: ["-l"] };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WsSocket = any;

interface TerminalMessage {
  type: string;
  data?: string;
  cols?: number;
  rows?: number;
}

/**
 * Attach a PTY-backed terminal session to `socket`.
 *
 * The caller is responsible for error-handling on the socket before calling
 * this function (e.g. registering a top-level "error" listener).
 */
export async function handleTerminalConnection(
  socket: WsSocket
): Promise<void> {
  let pty: typeof import("node-pty");
  try {
    pty = await getPty();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("node-pty unavailable", msg);
    try {
      socket.send(
        JSON.stringify({
          type: "error",
          message: "Terminal unavailable: node-pty failed to load."
        })
      );
      socket.close(1011, "node-pty unavailable");
    } catch {
      // socket may already be gone
    }
    return;
  }

  const { file, args } = resolveShell();
  const defaultCols = 80;
  const defaultRows = 24;

  log.info(`Spawning terminal: ${file} ${args.join(" ")}`);

  const proc = pty.spawn(file, args, {
    name: "xterm-256color",
    cols: defaultCols,
    rows: defaultRows,
    cwd: process.cwd(),
    env: process.env as Record<string, string>
  });

  // PTY → WebSocket
  const onData = proc.onData((data: string) => {
    try {
      socket.send(JSON.stringify({ type: "output", data }));
    } catch {
      // socket may be closing
    }
  });

  const onExit = proc.onExit(({ exitCode }: { exitCode: number }) => {
    log.info(`Terminal process exited with code ${exitCode}`);
    try {
      socket.send(JSON.stringify({ type: "exit", code: exitCode }));
      socket.close(1000, "process exited");
    } catch {
      // socket may already be closed
    }
  });

  // WebSocket → PTY
  socket.on("message", (raw: Buffer | string) => {
    try {
      const msg: TerminalMessage = JSON.parse(raw.toString());

      switch (msg.type) {
        case "input":
          if (typeof msg.data === "string") {
            proc.write(msg.data);
          }
          break;

        case "resize":
          if (
            typeof msg.cols === "number" &&
            typeof msg.rows === "number" &&
            msg.cols > 0 &&
            msg.rows > 0
          ) {
            proc.resize(msg.cols, msg.rows);
          }
          break;

        case "ping":
          try {
            socket.send(JSON.stringify({ type: "pong", ts: Date.now() }));
          } catch {
            // ignore
          }
          break;

        default:
          log.warn(`Unknown terminal message type: ${msg.type}`);
      }
    } catch {
      // Malformed message — ignore
    }
  });

  // Cleanup when the WebSocket closes
  socket.on("close", () => {
    log.info("Terminal WebSocket closed, killing PTY");
    onData.dispose();
    onExit.dispose();
    try {
      proc.kill();
    } catch {
      // process may have already exited
    }
  });

  // Send initial greeting
  try {
    socket.send(JSON.stringify({ type: "output", data: "" }));
  } catch {
    // socket may already be gone
  }
}
