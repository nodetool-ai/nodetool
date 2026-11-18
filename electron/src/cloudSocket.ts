/**
 * The workflow socket of a cloud document in the desktop app (decision D25,
 * technical design, "Runs of a cloud document"; WP1.14).
 *
 * Run on a cloud document goes to the cloud server, as in the web app. The
 * renderer never holds a token, so it cannot open that socket itself. It
 * asks the main process, which takes an access token for one upgrade from
 * the account helper, opens `wss://<server>/ws` with it in the
 * `Authorization` header, and drops it once the upgrade is done. Frames go
 * both ways over IPC.
 *
 * The renderer names no URL: the socket always goes to `/ws` on the
 * signed-in origin. The server closes the socket when the native session
 * ends or the token that opened it expires (close code 4401). A sign-out
 * here closes every socket from this side. Either way the renderer gets a
 * close event and opens a new socket when it needs one.
 */
import type { SocketTokenResult } from "./cloudRequests";
import type { CloudAccountState, CloudSocketEvent, CloudSocketOpenResult } from "./types.d";

export type { CloudSocketEvent, CloudSocketOpenResult } from "./types.d";

/** Sockets one window may hold at once. */
export const MAX_SOCKETS_PER_WINDOW = 4;
/** Upper bound on a frame either side sends. */
export const MAX_SOCKET_FRAME_BYTES = 32 * 1024 * 1024;
/** Bytes a socket may hold unsent before the renderer's frames are refused. */
export const MAX_SOCKET_BUFFERED_BYTES = 64 * 1024 * 1024;
/** The close code the server uses for an ended session, reused for a sign-out here. */
export const SESSION_ENDED_CLOSE_CODE = 4401;

/** What the relay needs of a `ws` WebSocket. */
export interface SocketLike {
  readonly readyState: number;
  readonly bufferedAmount: number;
  send(data: Uint8Array | string): void;
  close(code?: number, reason?: string): void;
  terminate(): void;
  on(event: "open", listener: () => void): unknown;
  on(event: "message", listener: (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => void): unknown;
  on(event: "close", listener: (code: number, reason: Buffer) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
}

const OPEN = 1;

export interface CloudSocketsDeps {
  account: {
    state(): CloudAccountState;
    serverOrigin(): string | null;
    socketToken(): Promise<SocketTokenResult>;
  };
  /**
   * Opens a socket with these upgrade headers, following no redirect and
   * refusing frames over MAX_SOCKET_FRAME_BYTES.
   */
  connect: (url: string, headers: Record<string, string>) => SocketLike;
  /** Hands one event to the window that owns the socket. */
  deliver: (owner: number, event: CloudSocketEvent) => void;
  log: (message: string, level?: "info" | "warn" | "error") => void;
}

interface Entry {
  owner: number;
  /** Null while the token is on its way. */
  socket: SocketLike | null;
}

/** `wss://<host>/ws` for a canonical HTTPS origin, or null for any other. */
export function cloudSocketUrl(origin: string | null): string | null {
  if (!origin) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.origin !== origin) {
    return null;
  }
  return `wss://${url.host}/ws`;
}

function frameBytes(data: Buffer | ArrayBuffer | Buffer[]): Uint8Array {
  if (Array.isArray(data)) {
    return new Uint8Array(Buffer.concat(data));
  }
  // A copy, so the IPC message holds no view of ws's pooled buffers.
  return new Uint8Array(data instanceof ArrayBuffer ? data.slice(0) : Buffer.from(data));
}

/**
 * Thread affinity: Electron's main process, on its event loop only. Owns the
 * sockets it opens and closes every one in signedOut(), closeOwner() for a
 * window that goes away, and dispose(). The access token lives only in the
 * upgrade headers of one connect() call.
 */
export class CloudSockets {
  private nextId = 1;
  private readonly entries = new Map<number, Entry>();

  constructor(private readonly deps: CloudSocketsDeps) {}

  async open(owner: number): Promise<CloudSocketOpenResult> {
    const url = cloudSocketUrl(this.deps.account.serverOrigin());
    if (this.deps.account.state().state !== "signedIn" || !url) {
      return { ok: false, error: "SIGNED_OUT" };
    }
    let held = 0;
    for (const entry of this.entries.values()) {
      if (entry.owner === owner) {
        held += 1;
      }
    }
    if (held >= MAX_SOCKETS_PER_WINDOW) {
      return { ok: false, error: "BUSY" };
    }
    const id = this.nextId++;
    const entry: Entry = { owner, socket: null };
    this.entries.set(id, entry);
    const token = await this.deps.account.socketToken();
    if (this.entries.get(id) !== entry) {
      // Closed or signed out while the token was on its way.
      return { ok: false, error: "SIGNED_OUT" };
    }
    if (!token.ok) {
      this.entries.delete(id);
      return { ok: false, error: token.error === "SIGNED_OUT" ? "SIGNED_OUT" : "OFFLINE" };
    }
    let socket: SocketLike;
    try {
      socket = this.deps.connect(url, { Authorization: `Bearer ${token.token}` });
    } catch (error) {
      this.entries.delete(id);
      this.deps.log(`Cloud socket could not open: ${String(error)}`, "warn");
      return { ok: false, error: "OFFLINE" };
    }
    entry.socket = socket;
    socket.on("open", () => {
      if (this.entries.get(id) === entry) {
        this.deps.deliver(owner, { id, kind: "open" });
      }
    });
    socket.on("message", (data, isBinary) => {
      if (this.entries.get(id) === entry) {
        this.deps.deliver(owner, {
          id,
          kind: "message",
          data: isBinary ? frameBytes(data) : Buffer.from(frameBytes(data)).toString("utf8"),
        });
      }
    });
    socket.on("error", (error) => {
      // The close event follows and ends the entry.
      this.deps.log(`Cloud socket error: ${error.message}`, "warn");
    });
    socket.on("close", (code, reason) => {
      if (this.entries.get(id) === entry) {
        this.entries.delete(id);
        this.deps.deliver(owner, { id, kind: "close", code, reason: reason.toString("utf8").slice(0, 123) });
      }
    });
    return { ok: true, id };
  }

  /** A frame of the window that owns the socket. False when it is refused. */
  send(owner: number, id: number, data: Uint8Array | string): boolean {
    const entry = this.entries.get(id);
    if (!entry || entry.owner !== owner || !entry.socket || entry.socket.readyState !== OPEN) {
      return false;
    }
    const size = typeof data === "string" ? Buffer.byteLength(data) : data.byteLength;
    if (size > MAX_SOCKET_FRAME_BYTES || entry.socket.bufferedAmount + size > MAX_SOCKET_BUFFERED_BYTES) {
      return false;
    }
    entry.socket.send(data);
    return true;
  }

  /** Closes a socket of the window that owns it. */
  close(owner: number, id: number, code = 1000): void {
    const entry = this.entries.get(id);
    if (entry && entry.owner === owner) {
      this.end(id, entry, code, "closed", false);
    }
  }

  /** The window went away: its sockets close and nothing is delivered. */
  closeOwner(owner: number): void {
    for (const [id, entry] of [...this.entries]) {
      if (entry.owner === owner) {
        this.end(id, entry, 1001, "window closed", false);
      }
    }
  }

  /** The account is no longer signed in: every socket closes from this side. */
  signedOut(): void {
    for (const [id, entry] of [...this.entries]) {
      this.end(id, entry, SESSION_ENDED_CLOSE_CODE, "signed_out", true);
    }
  }

  dispose(): void {
    for (const [id, entry] of [...this.entries]) {
      this.end(id, entry, 1001, "app quit", false);
    }
  }

  count(): number {
    return this.entries.size;
  }

  private end(id: number, entry: Entry, code: number, reason: string, notify: boolean): void {
    this.entries.delete(id);
    const socket = entry.socket;
    if (socket) {
      if (socket.readyState === OPEN) {
        // The server's code range stops at 4999. 1000 and 1001 are the only
        // standard codes a client may send.
        socket.close(code >= 4000 || code === 1000 || code === 1001 ? code : 1000, reason);
      } else {
        socket.terminate();
      }
    }
    if (notify) {
      this.deps.deliver(entry.owner, { id, kind: "close", code, reason });
    }
  }
}
