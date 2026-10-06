/**
 * Where the native-messaging bridge lives on disk.
 *
 * Chrome starts the native host when the extension connects. The host listens
 * on a per-user unix socket so any local client (the backend, the CLI) reaches
 * the extension without a server in between. Access control is the filesystem:
 * the directory is 0700 and the socket 0600, so only the same OS user connects.
 */

import os from "node:os";
import path from "node:path";

/** Native messaging host name. Must match `connectNative` in the extension. */
export const NATIVE_HOST_NAME = "ai.nodetool.browser_bridge";

function userName(): string {
  try {
    return os.userInfo().username || "default";
  } catch {
    return process.env.USER ?? process.env.USERNAME ?? "default";
  }
}

/** Windows named-pipe path for this user. */
export function bridgePipeName(): string {
  return `\\\\.\\pipe\\nodetool-browser-bridge-${userName()}`;
}

/** Directory holding one `<pid>.sock` per running native host. */
export function bridgeSocketDir(): string {
  return path.join(os.tmpdir(), `nodetool-browser-bridge-${userName()}`);
}

/** Socket path a native host with process id `pid` listens on. */
export function bridgeSocketPath(pid: number): string {
  return process.platform === "win32"
    ? bridgePipeName()
    : path.join(bridgeSocketDir(), `${pid}.sock`);
}
