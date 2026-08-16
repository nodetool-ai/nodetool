/**
 * The reconnecting socket names the run it wants to be routed back to.
 *
 * A run's replay buffer and control hooks live in the one server process
 * executing it. With more than one instance, a reconnect balanced onto another
 * machine finds neither — so the handshake carries `resume_job=<jobId>` and the
 * server replays it at the owner. The URL is rebuilt per connect attempt, which
 * is why this is a provider rather than a value fixed at construction.
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

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  readyState = 0;
  binaryType = "arraybuffer";
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose:
    | ((event: { code: number; reason: string; wasClean: boolean }) => void)
    | null = null;

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
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code, reason, wasClean });
  }
}

const latestSocket = (): FakeWebSocket =>
  FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

describe("GlobalWebSocketManager resume_job hint", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    installGlobal("WebSocket", FakeWebSocket);
    jest.useFakeTimers();
  });

  afterEach(() => {
    globalWebSocketManager.setResumeJobIdProvider(null);
    globalWebSocketManager.disconnect();
    jest.useRealTimers();
  });

  const connect = async (): Promise<void> => {
    const pending = globalWebSocketManager.ensureConnection();
    await jest.advanceTimersByTimeAsync(0);
    latestSocket().triggerOpen();
    await pending;
  };

  it("omits the hint when nothing is running", async () => {
    globalWebSocketManager.setResumeJobIdProvider(() => null);

    await connect();

    expect(latestSocket().url).toBe("ws://localhost:1234/ws");
  });

  it("carries the running job's id on the connect that follows a drop", async () => {
    let running: string | null = null;
    globalWebSocketManager.setResumeJobIdProvider(() => running);

    await connect();
    expect(latestSocket().url).toBe("ws://localhost:1234/ws");

    // A run starts, then the socket drops. The reconnect re-resolves the URL.
    running = "job-42";
    latestSocket().triggerClose(1006, "abnormal");
    await jest.advanceTimersByTimeAsync(2000);

    expect(latestSocket().url).toBe(
      "ws://localhost:1234/ws?resume_job=job-42"
    );
  });

  it("drops the hint again once the run is over", async () => {
    let running: string | null = "job-42";
    globalWebSocketManager.setResumeJobIdProvider(() => running);

    await connect();
    expect(latestSocket().url).toContain("resume_job=job-42");

    running = null;
    latestSocket().triggerClose(1006, "abnormal");
    await jest.advanceTimersByTimeAsync(2000);

    expect(latestSocket().url).toBe("ws://localhost:1234/ws");
  });

  it("retires the hint after two failed connects and restores it on success", async () => {
    // The failure this guards: a deploy retires the machine that owned the
    // run, the row still says running, and every reconnect asks the proxy to
    // replay onto a machine that no longer exists. The shared socket — chat
    // included — would never come back.
    globalWebSocketManager.setResumeJobIdProvider(() => "job-42");

    await connect();
    expect(latestSocket().url).toContain("resume_job=job-42");

    // First failed reconnect: still hinted.
    latestSocket().triggerClose(1006, "abnormal");
    await jest.advanceTimersByTimeAsync(2000);
    expect(latestSocket().url).toContain("resume_job=job-42");

    // Second: still hinted, and this close is the second failure in a row.
    latestSocket().triggerClose(1006, "abnormal");
    await jest.advanceTimersByTimeAsync(3000);
    expect(latestSocket().url).toContain("resume_job=job-42");

    // Third attempt goes out bare, so it can land anywhere and connect.
    latestSocket().triggerClose(1006, "abnormal");
    await jest.advanceTimersByTimeAsync(5000);
    expect(latestSocket().url).toBe("ws://localhost:1234/ws");

    // It lands. The counter resets, so the next drop is hinted again.
    latestSocket().triggerOpen();
    latestSocket().triggerClose(1006, "abnormal");
    await jest.advanceTimersByTimeAsync(2000);
    expect(latestSocket().url).toContain("resume_job=job-42");
  });

  it("connects anyway when the provider throws", async () => {
    globalWebSocketManager.setResumeJobIdProvider(() => {
      throw new Error("store blew up");
    });

    await connect();

    expect(latestSocket().url).toBe("ws://localhost:1234/ws");
  });
});
