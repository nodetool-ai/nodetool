/**
 * The liveness watchdog covers the failure `onclose` never reports: a
 * half-open socket the runtime still calls OPEN while nothing arrives. Mobile
 * hits this constantly — suspended radios, cellular/wifi handoffs.
 */
import { WebSocketManager } from '../WebSocketManager';
import type { WebSocketConfig } from '../../types/chat';

jest.mock('msgpackr', () => ({
  pack: jest.fn(<T,>(msg: T) => msg),
  unpack: jest.fn(<T,>(buf: T) => buf),
}));

jest.mock('../../hooks/useAppLifecycle', () => ({
  isAppForeground: () => true,
  subscribeAppLifecycle: () => () => undefined,
}));

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  readyState = 0;
  binaryType = 'arraybuffer';
  sent: Array<Record<string, unknown>> = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(message: unknown): void {
    this.sent.push(message as Record<string, unknown>);
  }

  close(code = 1000, reason = ''): void {
    if (this.readyState === FakeWebSocket.CLOSED) {
      return;
    }
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }

  /** Close the underlying transport without notifying the client. */
  goHalfOpen(): void {
    this.onclose = null;
  }

  triggerOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  /** The manager parses string frames as JSON, so no msgpack round-trip. */
  deliver(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  get pings(): Array<Record<string, unknown>> {
    return this.sent.filter((m) => m.type === 'ping');
  }
}

const latestSocket = (): FakeWebSocket =>
  FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

const HEARTBEAT_INTERVAL = 4000;
const HEARTBEAT_TIMEOUT = 1000;

const createManager = (
  overrides: Partial<WebSocketConfig> = {}
): WebSocketManager =>
  new WebSocketManager({
    url: 'ws://localhost:7777/ws',
    reconnect: false,
    heartbeatInterval: HEARTBEAT_INTERVAL,
    heartbeatTimeout: HEARTBEAT_TIMEOUT,
    ...overrides,
  });

const connect = async (mgr: WebSocketManager): Promise<void> => {
  const pending = mgr.connect();
  latestSocket().triggerOpen();
  await pending;
};

describe('mobile WebSocketManager liveness watchdog', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    Reflect.set(globalThis, 'WebSocket', FakeWebSocket);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('stays quiet while the server keeps sending', async () => {
    const mgr = createManager();
    await connect(mgr);

    for (let i = 0; i < 4; i++) {
      jest.advanceTimersByTime(HEARTBEAT_INTERVAL - 500);
      latestSocket().deliver({ type: 'chunk' });
    }

    expect(latestSocket().pings).toHaveLength(0);
    expect(mgr.getState()).toBe('connected');

    mgr.destroy();
  });

  it('probes with a ping once inbound traffic goes silent', async () => {
    const mgr = createManager();
    await connect(mgr);

    jest.advanceTimersByTime(HEARTBEAT_INTERVAL);

    expect(latestSocket().pings).toHaveLength(1);
    expect(mgr.getState()).toBe('connected');

    mgr.destroy();
  });

  it('tears the socket down when the probe goes unanswered', async () => {
    const mgr = createManager();
    const onClose = jest.fn();
    const mgrWithCallbacks = mgr;
    mgrWithCallbacks.setCallbacks({ onClose });
    await connect(mgr);

    latestSocket().goHalfOpen();
    jest.advanceTimersByTime(HEARTBEAT_INTERVAL + HEARTBEAT_TIMEOUT + 100);

    expect(onClose).toHaveBeenCalledWith(1006, 'Heartbeat timeout');
    expect(mgr.getState()).toBe('failed');

    mgr.destroy();
  });

  it('keeps the connection when the probe is answered', async () => {
    const mgr = createManager();
    const onClose = jest.fn();
    mgr.setCallbacks({ onClose });
    await connect(mgr);

    jest.advanceTimersByTime(HEARTBEAT_INTERVAL);
    latestSocket().deliver({ type: 'pong' });
    jest.advanceTimersByTime(HEARTBEAT_TIMEOUT + 100);

    expect(onClose).not.toHaveBeenCalled();
    expect(mgr.getState()).toBe('connected');

    mgr.destroy();
  });

  it('answers server pings and does not surface them to subscribers', async () => {
    const mgr = createManager();
    const onMessage = jest.fn();
    mgr.setCallbacks({ onMessage });
    await connect(mgr);

    latestSocket().deliver({ type: 'ping' });
    latestSocket().deliver({ type: 'pong' });

    expect(onMessage).not.toHaveBeenCalled();
    expect(latestSocket().sent.filter((m) => m.type === 'pong')).toHaveLength(1);

    mgr.destroy();
  });

  it('probes instead of trusting readyState when the app foregrounds', async () => {
    const mgr = createManager({ reconnect: true, reconnectInterval: 100 });
    await connect(mgr);

    latestSocket().goHalfOpen();
    mgr.resumeFromBackground();

    expect(latestSocket().pings).toHaveLength(1);

    // Nothing answers, so the socket is dropped and a new one is opened.
    jest.advanceTimersByTime(HEARTBEAT_TIMEOUT + 100);
    jest.advanceTimersByTime(200);

    expect(FakeWebSocket.instances).toHaveLength(2);

    mgr.destroy();
  });
});
