/**
 * CDP relay: the heart of the thin proxy.
 *
 * Maintains a single WebSocket to the Nodetool server's `/ws/extension` side
 * channel and, when the user explicitly attaches a tab, bridges JSON wire
 * frames to the `chrome.debugger` API:
 *
 *   host {kind:"cdp"}        -> chrome.debugger.sendCommand -> {kind:"cdp_result"}
 *   chrome.debugger.onEvent  -> {kind:"cdp_event"}                       host
 *   host {kind:"attach"}     -> chrome.debugger.attach     -> {kind:"attached"}
 *   host {kind:"detach"}     -> chrome.debugger.detach      (+ {kind:"detach"})
 *   host {kind:"ping"}       -> {kind:"pong"}
 *   chrome.debugger.onDetach -> {kind:"error"} (fatal) + teardown
 *
 * The relay never originates CDP commands; it is a pure conduit. Attach is
 * driven by a user gesture in the popup (`attachActiveTab`), never
 * automatically.
 */

import {
  parseExtensionFrame,
  type AttachedFrame,
  type CdpEventFrame,
  type CdpResultFrame,
  type DetachFrame,
  type ErrorFrame,
  type ExtensionExtToHostFrame,
  type ExtensionFrame,
  type PongFrame,
} from "./protocol.js";

/** CDP protocol version requested when attaching the debugger. */
const CDP_PROTOCOL_VERSION = "1.3";

/** Connection lifecycle for the popup to render. */
export type RelayConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

/** A snapshot of relay state for the popup. */
export interface RelayStatus {
  connection: RelayConnectionState;
  /** The configured server WS URL. */
  serverUrl: string;
  /** The tab id the debugger is attached to, or null when detached. */
  attachedTabId: number | null;
  /** Last error message, if any. */
  lastError: string | null;
}

/** Default `/ws/extension` URL when none is stored. */
export const DEFAULT_SERVER_URL = "ws://localhost:7777/ws/extension";

/** chrome.storage key holding the server WS URL. */
export const STORAGE_KEY_SERVER_URL = "nodetool_server_ws_url";

/** Reconnect backoff bounds (ms). */
const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

/** Keepalive alarm name and period. Service workers idle out after ~30s. */
const KEEPALIVE_ALARM = "nodetool-cdp-keepalive";
const KEEPALIVE_PERIOD_MINUTES = 0.4; // ~24s, under the 30s idle threshold.

type StatusListener = (status: RelayStatus) => void;

/**
 * Singleton relay. The service worker constructs exactly one of these.
 */
export class CdpRelay {
  private ws: WebSocket | null = null;
  private serverUrl = DEFAULT_SERVER_URL;
  private connection: RelayConnectionState = "disconnected";
  private attachedTabId: number | null = null;
  private lastError: string | null = null;
  private reconnectDelay = RECONNECT_MIN_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manualClose = false;
  private readonly statusListeners = new Set<StatusListener>();

  /**
   * The `chrome.debugger` onEvent/onDetach handlers are bound once and kept so
   * they can be removed on teardown.
   */
  private readonly onDebuggerEvent = (
    source: chrome.debugger.Debuggee,
    method: string,
    params?: object,
  ): void => {
    if (source.tabId !== this.attachedTabId) {
      return;
    }
    const frame: CdpEventFrame = {
      kind: "cdp_event",
      method,
      params: (params ?? {}) as Record<string, unknown>,
    };
    this.send(frame);
  };

  private readonly onDebuggerDetach = (
    source: chrome.debugger.Debuggee,
    reason: string,
  ): void => {
    if (source.tabId !== this.attachedTabId) {
      return;
    }
    this.attachedTabId = null;
    this.sendFatal(`Debugger detached: ${reason}`);
    this.emitStatus();
  };

  /** Load the persisted server URL and open the socket. */
  async start(): Promise<void> {
    this.serverUrl = await loadServerUrl();
    chrome.debugger.onEvent.addListener(this.onDebuggerEvent);
    chrome.debugger.onDetach.addListener(this.onDebuggerDetach);
    this.ensureKeepalive();
    this.connect();
  }

  /** Current status snapshot. */
  getStatus(): RelayStatus {
    return {
      connection: this.connection,
      serverUrl: this.serverUrl,
      attachedTabId: this.attachedTabId,
      lastError: this.lastError,
    };
  }

  /** Subscribe to status changes; returns an unsubscribe fn. */
  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  /** Update and persist the server URL, then reconnect. */
  async setServerUrl(url: string): Promise<void> {
    const trimmed = url.trim();
    if (!trimmed) {
      return;
    }
    this.serverUrl = trimmed;
    await chrome.storage.local.set({ [STORAGE_KEY_SERVER_URL]: trimmed });
    this.reconnectDelay = RECONNECT_MIN_MS;
    this.reconnect();
  }

  /**
   * Attach the debugger to the currently active tab. Driven by an explicit
   * user gesture in the popup. Resolves to the attached tab id.
   */
  async attachActiveTab(): Promise<number> {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id) {
      throw new Error("No active tab to attach to.");
    }
    await this.attachTab(tab.id);
    return tab.id;
  }

  /** Detach the debugger from the current tab, if attached. */
  async detach(reason = "User detached"): Promise<void> {
    await this.teardownDebugger(reason, true);
    this.emitStatus();
  }

  /** Reply to a keepalive alarm by nudging the socket. */
  handleKeepalive(): void {
    if (this.connection === "disconnected" || this.connection === "error") {
      this.connect();
    }
  }

  private connect(): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    this.manualClose = false;
    this.setConnection("connecting");

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.serverUrl);
    } catch (err) {
      this.lastError = errorMessage(err);
      this.setConnection("error");
      this.scheduleReconnect();
      return;
    }
    this.ws = socket;

    socket.addEventListener("open", () => {
      this.reconnectDelay = RECONNECT_MIN_MS;
      this.lastError = null;
      this.setConnection("connected");
    });

    socket.addEventListener("message", (event) => {
      void this.handleMessage(event.data);
    });

    socket.addEventListener("close", () => {
      if (this.ws === socket) {
        this.ws = null;
      }
      if (!this.manualClose) {
        this.setConnection("disconnected");
        this.scheduleReconnect();
      }
    });

    socket.addEventListener("error", () => {
      this.lastError = "WebSocket connection error.";
      this.setConnection("error");
    });
  }

  private reconnect(): void {
    this.manualClose = true;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Socket may already be closing; ignore.
      }
      this.ws = null;
    }
    this.connect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) {
      return;
    }
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private async handleMessage(raw: unknown): Promise<void> {
    if (typeof raw !== "string") {
      return;
    }
    const frame = parseExtensionFrame(raw);
    if (!frame) {
      return;
    }
    switch (frame.kind) {
      case "cdp":
        await this.handleCdpCommand(frame.id, frame.method, frame.params);
        break;
      case "attach":
        await this.handleAttachRequest();
        break;
      case "detach":
        await this.teardownDebugger(frame.reason ?? "Host detached", false);
        this.emitStatus();
        break;
      case "ping":
        this.send<PongFrame>({ kind: "pong", ts: frame.ts });
        break;
      default:
        // asset_chunk and other host→ext frames are handled by future
        // upload/capture features; the relay ignores unknown kinds.
        break;
    }
  }

  private async handleCdpCommand(
    id: number,
    method: string,
    params: Record<string, unknown> | undefined,
  ): Promise<void> {
    if (this.attachedTabId === null) {
      this.send<CdpResultFrame>({
        kind: "cdp_result",
        id,
        error: { message: "Debugger is not attached to any tab." },
      });
      return;
    }
    try {
      const result = await chrome.debugger.sendCommand(
        { tabId: this.attachedTabId },
        method,
        params ?? {},
      );
      this.send<CdpResultFrame>({
        kind: "cdp_result",
        id,
        result: (result ?? {}) as Record<string, unknown>,
      });
    } catch (err) {
      this.send<CdpResultFrame>({
        kind: "cdp_result",
        id,
        error: { message: errorMessage(err) },
      });
    }
  }

  /**
   * Host-initiated attach. The host cannot pick the tab; it relies on the user
   * having attached via the popup. If nothing is attached yet, attach the
   * active tab (still requires the user to have opened the popup gesture flow
   * — here we honor the host request as a convenience, but the spec's primary
   * path is the popup button).
   */
  private async handleAttachRequest(): Promise<void> {
    if (this.attachedTabId !== null) {
      this.send<AttachedFrame>({
        kind: "attached",
        tabId: this.attachedTabId,
      });
      return;
    }
    try {
      const tabId = await this.attachActiveTab();
      this.send<AttachedFrame>({ kind: "attached", tabId });
    } catch (err) {
      this.sendFatal(errorMessage(err));
    }
  }

  private async attachTab(tabId: number): Promise<void> {
    if (this.attachedTabId === tabId) {
      this.send<AttachedFrame>({ kind: "attached", tabId });
      this.emitStatus();
      return;
    }
    if (this.attachedTabId !== null) {
      await this.teardownDebugger("Re-attaching to a new tab", false);
    }
    await chrome.debugger.attach({ tabId }, CDP_PROTOCOL_VERSION);
    this.attachedTabId = tabId;
    this.lastError = null;
    this.send<AttachedFrame>({ kind: "attached", tabId });
    this.emitStatus();
  }

  /**
   * Detach the debugger and optionally notify the host with a `detach` frame.
   * `notifyHost` is false when the host itself requested the detach.
   */
  private async teardownDebugger(
    reason: string,
    notifyHost: boolean,
  ): Promise<void> {
    const tabId = this.attachedTabId;
    this.attachedTabId = null;
    if (tabId === null) {
      return;
    }
    try {
      await chrome.debugger.detach({ tabId });
    } catch {
      // Tab may already be gone; detaching is best-effort.
    }
    if (notifyHost) {
      this.send<DetachFrame>({ kind: "detach", reason });
    }
  }

  private send<T extends ExtensionExtToHostFrame>(frame: T): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(frame));
    }
  }

  private sendFatal(message: string): void {
    this.lastError = message;
    this.send<ErrorFrame>({ kind: "error", message });
  }

  private setConnection(state: RelayConnectionState): void {
    this.connection = state;
    this.emitStatus();
  }

  private emitStatus(): void {
    const status = this.getStatus();
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  private ensureKeepalive(): void {
    chrome.alarms.create(KEEPALIVE_ALARM, {
      periodInMinutes: KEEPALIVE_PERIOD_MINUTES,
    });
  }
}

/** The keepalive alarm name, exported for the service worker's alarm router. */
export const KEEPALIVE_ALARM_NAME = KEEPALIVE_ALARM;

/** Load the stored server URL, falling back to the default. */
export async function loadServerUrl(): Promise<string> {
  const stored = await chrome.storage.local.get(STORAGE_KEY_SERVER_URL);
  const url = stored[STORAGE_KEY_SERVER_URL];
  return typeof url === "string" && url.trim() ? url.trim() : DEFAULT_SERVER_URL;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === "string") {
    return err;
  }
  // chrome.runtime.lastError-style objects expose a `message` string.
  if (
    typeof err === "object" &&
    err !== null &&
    typeof (err as { message?: unknown }).message === "string"
  ) {
    return (err as { message: string }).message;
  }
  return "Unknown error.";
}

// Re-export the frame union for consumers that want the type without reaching
// into protocol directly.
export type { ExtensionFrame };
