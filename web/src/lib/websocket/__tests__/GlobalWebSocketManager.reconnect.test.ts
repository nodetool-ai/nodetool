/**
 * Regression: `ensureConnection()` used to build a second `WebSocketManager`
 * whenever it was called while the previous one sat in its reconnect-backoff
 * window (both `isConnected` and `isConnecting` are false there). The orphan
 * kept its socket and its `on("message") -> routeMessage` registration, so
 * every message was routed twice.
 */
import { globalWebSocketManager } from "../GlobalWebSocketManager";
import { installGlobal } from "../../../test-utils/doubles";

jest.mock("../../../stores/BASE_URL", () => ({
  BASE_URL: "http://localhost:7777",
  UNIFIED_WS_URL: "ws://localhost:1234/ws"
}));

jest.mock("../../supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } })
    }
  }
}));

jest.mock("../../tools/frontendTools", () => ({
  FrontendToolRegistry: { getManifest: jest.fn().mockReturnValue([]) }
}));

jest.mock("../../../stores/resourceChangeHandler", () => ({
  handleResourceChange: jest.fn(),
  invalidateAllResourceQueries: jest.fn()
}));

jest.mock("msgpackr", () => ({
  pack: jest.fn(() => new Uint8Array([1])),
  unpack: jest.fn((buf: Uint8Array) => buf)
}));

interface FakeCloseEvent {
  code: number;
  reason: string;
  wasClean: boolean;
}

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  readyState = 0;
  binaryType = "arraybuffer";
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: FakeCloseEvent) => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(): void {
    /* no-op */
  }

  close(code = 1000, reason = ""): void {
    this.triggerClose(code, reason, code === 1000);
  }

  triggerOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  triggerClose(code: number, reason = "", wasClean = false): void {
    if (this.readyState === FakeWebSocket.CLOSED) {
      return;
    }
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code, reason, wasClean });
  }

  get isOpen(): boolean {
    return this.readyState === FakeWebSocket.OPEN;
  }
}

const latestSocket = (): FakeWebSocket =>
  FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

describe("GlobalWebSocketManager reconnect handling", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    installGlobal("WebSocket", FakeWebSocket);
    jest.useFakeTimers();
  });

  afterEach(() => {
    globalWebSocketManager.disconnect();
    jest.useRealTimers();
  });

  const connect = async (): Promise<void> => {
    const pending = globalWebSocketManager.ensureConnection();
    // Let buildAuthenticatedUrl's dynamic import settle so the socket exists.
    await jest.advanceTimersByTimeAsync(0);
    latestSocket().triggerOpen();
    await pending;
  };

  it("does not open a second socket while the manager is in reconnect backoff", async () => {
    await connect();
    expect(FakeWebSocket.instances).toHaveLength(1);

    // Abnormal close -> "close" fires (clearing both flags) and a reconnect is
    // scheduled. Nothing is "connecting" until the backoff timer elapses.
    latestSocket().triggerClose(1006, "abnormal");
    expect(globalWebSocketManager.getConnectionState()).toEqual({
      isConnected: false,
      isConnecting: false
    });

    const secondCall = globalWebSocketManager.ensureConnection();
    await jest.advanceTimersByTimeAsync(0);

    // Still one socket: the pending reconnect owns the connection.
    expect(FakeWebSocket.instances).toHaveLength(1);

    // Let the backoff timer fire and the reconnect succeed.
    await jest.advanceTimersByTimeAsync(2000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    latestSocket().triggerOpen();
    await jest.advanceTimersByTimeAsync(200);
    await expect(secondCall).resolves.toBeUndefined();

    // Exactly one live socket, so each server message is routed once.
    expect(FakeWebSocket.instances.filter((s) => s.isOpen)).toHaveLength(1);
  });

  it("closes the previous socket when a new manager replaces it", async () => {
    await connect();
    const first = latestSocket();

    // Force a rebuild from a terminal state.
    globalWebSocketManager.disconnect();
    expect(first.isOpen).toBe(false);

    await connect();
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.instances.filter((s) => s.isOpen)).toHaveLength(1);
  });
});
