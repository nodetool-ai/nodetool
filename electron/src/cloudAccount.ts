/**
 * The cloud account of the desktop app (technical design, "The Electron
 * desktop app"; decision D23).
 *
 * The node editor, the timeline and this app share one sign-in per cloud
 * server: a keychain record, a lock file and a generation file that only the
 * native account library (`native/account`) reads and writes. That library
 * runs here in its own process, nodetool-account-helper, staged by
 * `scripts/build-account-helper.mjs`. Messages are JSON lines on its stdin
 * and stdout.
 *
 * The helper has no network stack, so this process sends its HTTP requests.
 * Those carry tokens, so every request is checked here again: HTTPS, the
 * session's server origin, never a redirect. The browser opens only the
 * server's authorize page. The renderer receives the account state and
 * nothing else: no token, handle or record leaves this module.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { existsSync } from "fs";
import * as path from "path";
import { createInterface } from "readline";
import { app, BrowserWindow, net, protocol, shell } from "electron";
import WebSocket from "ws";
import { z } from "zod";
import {
  CLOUD_MEDIA_SCHEME,
  CloudRequests,
  cloudMediaResponse,
  type CloudFetchLike,
  type CloudRequestInput,
  type CloudResponse,
  type SocketTokenResult,
  type TransferResult,
} from "./cloudRequests";
import { CloudSockets, MAX_SOCKET_FRAME_BYTES } from "./cloudSocket";
import { getLocalClientToken } from "./localClientToken";
import { logMessage } from "./logger";
import { trustedLocalOrigin } from "./serverProof";
import { IpcChannels, type CloudAccountState } from "./types.d";

/** The default cloud server, as in the native apps' cloudServerOrigin(). */
export const DEFAULT_CLOUD_SERVER = "https://api.nodetool.ai";

/** Delays before restarting a helper that exited, then it stays stopped. */
const RESTART_DELAYS_MS = [1000, 5000, 30_000];
/** Upper bound on one forwarded request, whatever the helper asks. */
const MAX_REQUEST_MS = 30_000;
/** Upper bound on a response body handed to the helper. */
const MAX_RESPONSE_BYTES = 1 << 20;
/** Upper bound on a string in the state the renderer receives. */
const MAX_STATE_TEXT = 500;

/**
 * The canonical HTTPS origin of a configured server, as `origin.h` defines
 * it: scheme and host in lower case, default port dropped. Null for
 * anything else, including user information, a path, a query or a fragment.
 */
export function canonicalHttpsOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "" || /[\s\\]/.test(trimmed)) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    return null;
  }
  if (url.pathname !== "/" || /^https:\/\/[^/]+\/./.test(trimmed)) {
    return null;
  }
  return url.origin;
}

/** The server the native apps sign in to: NODETOOL_CLOUD_SERVER or the hosted cloud. */
export function configuredCloudServer(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.NODETOOL_CLOUD_SERVER?.trim();
  return configured ? configured : DEFAULT_CLOUD_SERVER;
}

/** One `http` message of the helper. */
export interface HelperHttpRequest {
  id: number;
  method: string;
  url: string;
  headers: [string, string][];
  body: string;
  timeoutMs: number;
  requiredOrigin: string;
}

export interface ForwardedResponse {
  /** 0 when nothing was sent or no response arrived. */
  status: number;
  body: string;
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: [string, string][]; body?: string; redirect: "manual"; signal: AbortSignal },
) => Promise<{ status: number; type?: string; text(): Promise<string> }>;

const NO_RESPONSE: ForwardedResponse = { status: 0, body: "" };

/**
 * Whether a request of the helper may be sent: HTTPS, to the server origin
 * this app started the helper for, and to the origin the request itself
 * requires when it names one. The check is repeated here because a token
 * must never reach another host (SR3, FC29).
 */
export function mayForward(request: HelperHttpRequest, serverOrigin: string | null): boolean {
  if (!serverOrigin) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.origin !== serverOrigin) {
    return false;
  }
  if (request.requiredOrigin !== "" && request.requiredOrigin !== serverOrigin) {
    return false;
  }
  return request.method === "GET" || request.method === "POST";
}

/**
 * Send one request of the helper. Never follows a redirect: a 3xx comes back
 * as it is, and an opaque redirect as status 0.
 */
export async function forwardRequest(
  request: HelperHttpRequest,
  serverOrigin: string | null,
  fetchImpl: FetchLike,
  signal: AbortSignal,
): Promise<ForwardedResponse> {
  if (!mayForward(request, serverOrigin)) {
    return NO_RESPONSE;
  }
  const timeout = AbortSignal.timeout(Math.min(Math.max(request.timeoutMs, 0), MAX_REQUEST_MS));
  try {
    const response = await fetchImpl(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.method === "GET" ? undefined : request.body,
      redirect: "manual",
      signal: AbortSignal.any([signal, timeout]),
    });
    if (response.type === "opaqueredirect" || response.status === 0) {
      return NO_RESPONSE;
    }
    const body = await response.text();
    if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES) {
      return NO_RESPONSE;
    }
    return { status: response.status, body };
  } catch {
    return NO_RESPONSE;
  }
}

/** Whether `url` is the server's authorize page, the one page the helper may open. */
export function isAuthorizeUrl(url: string, serverOrigin: string | null): boolean {
  if (!serverOrigin) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.origin === serverOrigin &&
      parsed.pathname === "/oauth/authorize" &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

const boundedText = z
  .string()
  .catch("")
  .transform((value) => value.slice(0, MAX_STATE_TEXT));

/**
 * A `state` message as the renderer may see it. Only these fields are kept,
 * so nothing else the helper sends can reach a window.
 */
const helperStateSchema = z.object({
  state: z.enum(["signedOut", "signingIn", "signedIn"]).catch("signedOut"),
  displayName: boundedText,
  accountId: boundedText,
  serverOrigin: boundedText,
  serverEndPending: z.boolean().catch(false),
  cloudAvailable: z.boolean().catch(false),
  keychainAvailable: z.boolean().catch(false),
  message: boundedText,
});

const helperHttpSchema = z.object({
  id: z.number().int(),
  method: z.string().catch(""),
  url: z.string().catch(""),
  headers: z.array(z.tuple([z.string(), z.string()])).catch([]),
  body: z.string().catch(""),
  timeoutMs: z.number().catch(10_000),
  requiredOrigin: z.string().catch(""),
  // Protocol version 2: the cloud request or transfer call this serves.
  request: z.number().int().optional().catch(undefined),
  transfer: z.number().int().optional().catch(undefined),
});

/** Every message the helper may send. Anything else is ignored. */
const helperMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("state") }).passthrough(),
  z.object({ type: z.literal("openBrowser"), url: z.string() }),
  z.object({ type: z.literal("http") }).passthrough(),
  z.object({ type: z.literal("httpCancel"), id: z.number().int() }),
  z.object({ type: z.literal("fatal"), message: boundedText }),
  z.object({ type: z.literal("ready") }).passthrough(),
  z.object({
    type: z.literal("response"),
    id: z.number().int(),
    status: z.number().int().catch(0),
    error: z.string().catch("OFFLINE"),
  }),
  z.object({
    type: z.literal("transferResult"),
    id: z.number().int(),
    status: z.string().catch("localUnavailable"),
    reason: boundedText,
    data: z.unknown(),
  }),
  z.object({
    type: z.literal("socketTokenResult"),
    id: z.number().int(),
    token: z.string().optional().catch(undefined),
    error: z.string().optional().catch(undefined),
  }),
]);

/** The renderer's copy of a `state` message, built field by field. */
export function stateFromHelper(message: Record<string, unknown>): Omit<CloudAccountState, "available"> {
  return helperStateSchema.parse(message);
}

/** Names the helper executable may have, per platform. */
function helperFileName(platform: NodeJS.Platform): string {
  return platform === "win32" ? "nodetool-account-helper.exe" : "nodetool-account-helper";
}

/**
 * Where the helper may be: `NODETOOL_ACCOUNT_HELPER`, then the app's bundled
 * resources (`electron/account-helper/` when unpackaged). Unlike the VST
 * host, never the user data folder: the helper reads the keychain, so only a
 * copy shipped with the app runs.
 */
export function accountHelperCandidates(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string[] {
  const name = helperFileName(platform);
  const candidates: string[] = [];
  const override = env.NODETOOL_ACCOUNT_HELPER?.trim();
  if (override) {
    candidates.push(override);
  }
  candidates.push(
    app.isPackaged
      ? path.join(process.resourcesPath, "account-helper", name)
      : path.join(app.getAppPath(), "account-helper", name),
  );
  return candidates;
}

export interface CloudAccountDeps {
  helperPath: string | null;
  /** The configured server, passed to the helper as it is. */
  server: string;
  spawnHelper: (file: string, args: string[]) => ChildProcessWithoutNullStreams;
  fetch: FetchLike;
  /** Sends the renderer's cloud requests and transfer calls (cloudRequests.ts). */
  cloudFetch: CloudFetchLike;
  /** The loopback origin of the local server this app runs, or null. */
  localOrigin: () => string | null;
  localClientToken: () => string;
  openExternal: (url: string) => Promise<void>;
  onState: (state: CloudAccountState) => void;
  setTimer: (fn: () => void, ms: number) => void;
  log: (message: string, level?: "info" | "warn" | "error") => void;
}

const UNAVAILABLE: Omit<CloudAccountState, "available" | "serverOrigin"> = {
  state: "signedOut",
  displayName: "",
  accountId: "",
  serverEndPending: false,
  cloudAvailable: true,
  keychainAvailable: true,
  message: "",
};

/**
 * Thread affinity: Electron's main process, on its event loop only. Owns the
 * helper process and ends it in dispose() by closing its stdin.
 */
export class CloudAccount {
  private readonly origin: string | null;
  private child: ChildProcessWithoutNullStreams | null = null;
  private restarts = 0;
  private disposed = false;
  private readonly inFlight = new Map<number, AbortController>();
  private current: CloudAccountState;
  private readonly requests: CloudRequests;
  private readonly stateListeners = new Set<(state: CloudAccountState) => void>();

  constructor(private readonly deps: CloudAccountDeps) {
    this.origin = canonicalHttpsOrigin(deps.server);
    this.requests = new CloudRequests({
      serverOrigin: this.origin,
      localOrigin: deps.localOrigin,
      localClientToken: deps.localClientToken,
      fetch: deps.cloudFetch,
      send: (message) => this.send(message),
      setTimer: (fn, ms) => {
        const timer = setTimeout(fn, ms);
        timer.unref?.();
        return () => clearTimeout(timer);
      },
      log: deps.log,
    });
    this.current = deps.helperPath
      ? { ...UNAVAILABLE, available: true, serverOrigin: this.origin ?? "" }
      : {
          ...UNAVAILABLE,
          available: false,
          serverOrigin: this.origin ?? "",
          message: "Cloud sign-in is not available in this build.",
        };
  }

  state(): CloudAccountState {
    return this.current;
  }

  /** Calls `listener` with every new state. Returns the function that stops it. */
  onStateChange(listener: (state: CloudAccountState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /** The canonical origin of the configured server, or null. */
  serverOrigin(): string | null {
    return this.origin;
  }

  start(): void {
    if (this.disposed || this.child || !this.deps.helperPath) {
      return;
    }
    const child = this.deps.spawnHelper(this.deps.helperPath, ["--server", this.deps.server]);
    this.child = child;
    child.stdin.on("error", () => {});
    child.stderr.on("data", (chunk: Buffer) => this.deps.log(`account helper: ${chunk.toString().trim()}`, "warn"));
    createInterface({ input: child.stdout }).on("line", (line) => this.onLine(line));
    child.on("error", (error) => {
      this.deps.log(`account helper failed to start: ${error.message}`, "error");
    });
    child.on("exit", (code) => this.onExit(child, code));
  }

  signIn(): void {
    this.send({ type: "signIn" });
  }

  cancelSignIn(): void {
    this.send({ type: "cancelSignIn" });
  }

  signOut(): void {
    this.send({ type: "signOut" });
  }

  /** A cloud request of the renderer, sent with the account's credential by the helper. */
  request(input: CloudRequestInput): Promise<CloudResponse> {
    if (this.current.state !== "signedIn") {
      return Promise.resolve({ ok: false, error: "SIGNED_OUT" });
    }
    return this.requests.request(input);
  }

  /** A call of the local server's transfer router, with the account added by the helper. */
  transfer(procedure: string, input: Record<string, unknown>): Promise<TransferResult> {
    if (this.current.state !== "signedIn") {
      return Promise.resolve({ status: "signedOut", reason: "SIGNED_OUT", data: null });
    }
    return this.requests.transfer(procedure, input);
  }

  /** An access token for one socket upgrade. Main process only, never the renderer. */
  socketToken(): Promise<SocketTokenResult> {
    if (this.current.state !== "signedIn") {
      return Promise.resolve({ ok: false, error: "SIGNED_OUT" });
    }
    return this.requests.socketToken();
  }

  dispose(): void {
    this.disposed = true;
    this.requests.dispose();
    for (const controller of this.inFlight.values()) {
      controller.abort();
    }
    this.inFlight.clear();
    // The helper cancels a sign-in that waits for the browser and exits.
    this.child?.stdin.end();
    this.child = null;
  }

  private send(message: Record<string, unknown>): boolean {
    if (this.child && !this.child.stdin.destroyed) {
      this.child.stdin.write(`${JSON.stringify(message)}\n`);
      return true;
    }
    return false;
  }

  private publish(next: CloudAccountState): void {
    const previous = this.current;
    this.current = next;
    if (next.state !== "signedIn" || accountChanged(previous, next)) {
      // FC30, TC119, TC125: no cloud request outlives the sign-in it was made under.
      this.requests.signedOut();
    }
    this.deps.onState(next);
    for (const listener of [...this.stateListeners]) {
      listener(next);
    }
  }

  private onLine(line: string): void {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      return;
    }
    const parsed = helperMessageSchema.safeParse(raw);
    if (!parsed.success) {
      return;
    }
    const message = parsed.data;
    switch (message.type) {
      case "state":
        this.restarts = 0;
        this.publish({ ...helperStateSchema.parse(message), available: true });
        return;
      case "openBrowser":
        void this.openBrowser(message.url);
        return;
      case "http": {
        const request = helperHttpSchema.safeParse(message);
        if (request.success && !this.requests.onHttp(request.data)) {
          void this.forward(request.data);
        }
        return;
      }
      case "httpCancel":
        this.inFlight.get(message.id)?.abort();
        this.inFlight.delete(message.id);
        this.requests.onHttpCancel(message.id);
        return;
      case "response":
        this.requests.onResponse(message);
        return;
      case "transferResult":
        this.requests.onTransferResult(message);
        return;
      case "socketTokenResult":
        this.requests.onSocketTokenResult(message);
        return;
      case "fatal":
        this.deps.log(`account helper: ${message.message}`, "error");
        return;
      case "ready":
        return;
    }
  }

  private async openBrowser(url: string): Promise<void> {
    let opened = false;
    if (isAuthorizeUrl(url, this.origin)) {
      try {
        await this.deps.openExternal(url);
        opened = true;
      } catch (error) {
        this.deps.log(`Could not open the browser for sign-in: ${String(error)}`, "warn");
      }
    } else {
      this.deps.log("Refused to open a sign-in URL that is not the server's authorize page", "warn");
    }
    this.send({ type: "browserResult", opened });
  }

  private async forward(request: HelperHttpRequest): Promise<void> {
    const { id } = request;
    if (!mayForward(request, this.origin)) {
      this.deps.log("Refused an account request to a host other than the cloud server", "warn");
    }
    const controller = new AbortController();
    this.inFlight.set(id, controller);
    const response = await forwardRequest(request, this.origin, this.deps.fetch, controller.signal);
    this.inFlight.delete(id);
    this.send({ type: "httpResponse", id, status: response.status, body: response.body });
  }

  private onExit(child: ChildProcessWithoutNullStreams, code: number | null): void {
    if (this.child !== child) {
      return;
    }
    this.child = null;
    for (const controller of this.inFlight.values()) {
      controller.abort();
    }
    this.inFlight.clear();
    this.requests.helperStopped();
    if (this.disposed) {
      return;
    }
    const delay = RESTART_DELAYS_MS[this.restarts];
    this.deps.log(`account helper exited with ${code}`, "warn");
    if (delay === undefined) {
      this.publish({
        ...UNAVAILABLE,
        available: false,
        serverOrigin: this.origin ?? "",
        message: "Cloud sign-in stopped working. Restart NodeTool to try again.",
      });
      return;
    }
    this.restarts += 1;
    this.deps.setTimer(() => this.start(), delay);
  }
}

let shared: CloudAccount | null = null;

/** The app's one cloud account. Its state goes to every window. */
export function getCloudAccount(): CloudAccount {
  if (!shared) {
    const helperPath = accountHelperCandidates().find((candidate) => existsSync(candidate)) ?? null;
    shared = new CloudAccount({
      helperPath,
      server: configuredCloudServer(),
      spawnHelper: (file, args) => spawn(file, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true }),
      fetch: (url, init) => net.fetch(url, init),
      cloudFetch: (url, { body, ...init }) =>
        net.fetch(url, { ...init, body: body instanceof Uint8Array ? new Uint8Array(body) : body }),
      // The app's own server, started at launch or reused after it proved itself.
      localOrigin: trustedLocalOrigin,
      localClientToken: getLocalClientToken,
      openExternal: (url) => shell.openExternal(url),
      onState: (state) => {
        for (const w of BrowserWindow.getAllWindows()) {
          if (!w.isDestroyed()) w.webContents.send(IpcChannels.CLOUD_ACCOUNT_EVENT, state);
        }
      },
      setTimer: (fn, ms) => setTimeout(fn, ms),
      log: (message, level) => logMessage(message, level),
    });
    shared.start();
  }
  return shared;
}

/**
 * Makes `nodetool-cloud:` a secure scheme that media elements and fetch can
 * load. Electron requires this before the app is ready.
 */
export function registerCloudMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: CLOUD_MEDIA_SCHEME,
      privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true },
    },
  ]);
}

/** Answers `nodetool-cloud:` URLs through the account (cloudMediaResponse), in one session. */
/**
 * Whether a signed-in account gave way to another without a sign-out in
 * between, as when a native app signs in another account on this computer.
 */
export function accountChanged(previous: CloudAccountState, next: CloudAccountState): boolean {
  return (
    previous.state === "signedIn" &&
    next.state === "signedIn" &&
    (previous.accountId !== next.accountId || previous.serverOrigin !== next.serverOrigin)
  );
}

export function handleCloudMediaScheme(target: Electron.Protocol = protocol): void {
  target.handle(CLOUD_MEDIA_SCHEME, (request) => cloudMediaResponse(request, getCloudAccount()));
}

let sharedSockets: CloudSockets | null = null;

/**
 * The workflow sockets of cloud documents (D25). Each belongs to the window
 * that opened it and closes when that window goes away or the account signs
 * out.
 */
export function getCloudSockets(): CloudSockets {
  if (!sharedSockets) {
    const account = getCloudAccount();
    const sockets = new CloudSockets({
      account,
      connect: (url, headers) =>
        new WebSocket(url, { headers, followRedirects: false, maxPayload: MAX_SOCKET_FRAME_BYTES }),
      deliver: (owner, event) => {
        const window = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.id === owner);
        window?.webContents.send(IpcChannels.CLOUD_SOCKET_EVENT, event);
      },
      log: (message, level) => logMessage(message, level),
    });
    let last = account.state();
    account.onStateChange((state) => {
      if (state.state !== "signedIn" || accountChanged(last, state)) {
        sockets.signedOut();
      }
      last = state;
    });
    sharedSockets = sockets;
  }
  return sharedSockets;
}

export function disposeCloudAccount(): void {
  sharedSockets?.dispose();
  sharedSockets = null;
  shared?.dispose();
  shared = null;
}
