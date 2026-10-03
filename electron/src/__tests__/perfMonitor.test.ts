import { openPerformanceMonitorWindow } from "../perfMonitor";
import { hardenWebContents } from "../windowSecurity";

type Handler = (...args: unknown[]) => void;

interface FakeWindow {
  destroyed: boolean;
  focus: jest.Mock;
  isDestroyed: () => boolean;
  setBackgroundColor: jest.Mock;
  loadURL: jest.Mock;
  on: jest.Mock;
  handlers: Record<string, Handler>;
  webContents: {
    once: jest.Mock;
    executeJavaScript: jest.Mock;
    onceHandlers: Record<string, Handler>;
  };
}

const mockWindows: FakeWindow[] = [];
const mockGetAppMetrics = jest.fn();
const mockGetAllWebContents = jest.fn();
let mockExecuteResult: () => Promise<void> = () => Promise.resolve();

jest.mock("electron", () => ({
  app: { getAppMetrics: () => mockGetAppMetrics() },
  webContents: { getAllWebContents: () => mockGetAllWebContents() },
  BrowserWindow: jest.fn().mockImplementation(() => {
    const win: FakeWindow = {
      destroyed: false,
      focus: jest.fn(),
      isDestroyed: () => win.destroyed,
      setBackgroundColor: jest.fn(),
      loadURL: jest.fn(() => Promise.resolve()),
      handlers: {},
      on: jest.fn((event: string, handler: Handler) => {
        win.handlers[event] = handler;
      }),
      webContents: {
        onceHandlers: {},
        once: jest.fn((event: string, handler: Handler) => {
          win.webContents.onceHandlers[event] = handler;
        }),
        executeJavaScript: jest.fn(() => mockExecuteResult())
      }
    };
    mockWindows.push(win);
    return win;
  })
}));

jest.mock("../windowSecurity", () => ({
  hardenWebContents: jest.fn()
}));

const closeWindow = (win: FakeWindow) => {
  win.destroyed = true;
  win.handlers.closed();
};

const lastRows = (win: FakeWindow): Array<Record<string, unknown>> => {
  const calls = win.webContents.executeJavaScript.mock.calls;
  const script = calls[calls.length - 1][0] as string;
  const match = /^window\.__updateMetrics\?\.\((.*)\)$/s.exec(script);
  return JSON.parse(match![1]);
};

describe("openPerformanceMonitorWindow", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockWindows.length = 0;
    mockGetAppMetrics.mockReset().mockReturnValue([]);
    mockGetAllWebContents.mockReset().mockReturnValue([]);
    mockExecuteResult = () => Promise.resolve();
    (hardenWebContents as jest.Mock).mockClear();
  });

  afterEach(() => {
    mockWindows.forEach((win) => {
      if (!win.destroyed) {
        closeWindow(win);
      }
    });
    jest.useRealTimers();
  });

  it("creates a sandboxed window with no node integration", () => {
    const { BrowserWindow } = jest.requireMock("electron");

    openPerformanceMonitorWindow();

    expect(BrowserWindow).toHaveBeenLastCalledWith(
      expect.objectContaining({
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true
        }
      })
    );
  });

  it("hardens the web contents and loads the page from a data URL", () => {
    openPerformanceMonitorWindow();

    const win = mockWindows[0];
    expect(hardenWebContents).toHaveBeenCalledWith(win.webContents);
    const url = win.loadURL.mock.calls[0][0] as string;
    expect(url.startsWith("data:text/html;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(url.split(",").slice(1).join(","))).toContain(
      "window.__updateMetrics"
    );
    expect(win.setBackgroundColor).toHaveBeenCalledWith("#111111");
  });

  it("focuses the existing window instead of opening a second one", () => {
    openPerformanceMonitorWindow();
    openPerformanceMonitorWindow();

    expect(mockWindows).toHaveLength(1);
    expect(mockWindows[0].focus).toHaveBeenCalledTimes(1);
  });

  it("opens a new window after the previous one closed", () => {
    openPerformanceMonitorWindow();
    closeWindow(mockWindows[0]);

    openPerformanceMonitorWindow();

    expect(mockWindows).toHaveLength(2);
  });

  it("opens a new window when the previous one was destroyed without a close event", () => {
    openPerformanceMonitorWindow();
    mockWindows[0].destroyed = true;

    openPerformanceMonitorWindow();

    expect(mockWindows).toHaveLength(2);
    expect(mockWindows[0].focus).not.toHaveBeenCalled();
  });

  it("pushes metrics once the page finishes loading", () => {
    openPerformanceMonitorWindow();
    const win = mockWindows[0];

    win.webContents.onceHandlers["did-finish-load"]();

    expect(win.webContents.executeJavaScript).toHaveBeenCalledTimes(1);
    expect(win.webContents.executeJavaScript.mock.calls[0][1]).toBe(true);
  });

  it("pushes metrics every second", () => {
    openPerformanceMonitorWindow();
    const win = mockWindows[0];

    jest.advanceTimersByTime(3000);

    expect(win.webContents.executeJavaScript).toHaveBeenCalledTimes(3);
  });

  it("sorts rows by CPU descending and converts memory from KB to MB", () => {
    mockGetAppMetrics.mockReturnValue([
      {
        type: "Utility",
        pid: 1,
        name: "Network",
        cpu: { percentCPUUsage: 2 },
        memory: { workingSetSize: 2048 }
      },
      {
        type: "Browser",
        pid: 2,
        cpu: { percentCPUUsage: 60 },
        memory: { workingSetSize: 102400 }
      }
    ]);
    openPerformanceMonitorWindow();

    jest.advanceTimersByTime(1000);

    expect(lastRows(mockWindows[0])).toEqual([
      { label: "Main process", pid: 2, cpu: 60, memoryMb: 100 },
      { label: "Utility: Network", pid: 1, cpu: 2, memoryMb: 2 }
    ]);
  });

  it("labels each process type", () => {
    mockGetAppMetrics.mockReturnValue([
      { type: "Utility", pid: 1, serviceName: "audio.mojom.AudioService" },
      { type: "GPU", pid: 2 },
      { type: "Tab", pid: 3 }
    ]);
    openPerformanceMonitorWindow();

    jest.advanceTimersByTime(1000);

    const labels = Object.fromEntries(
      lastRows(mockWindows[0]).map((row) => [row.pid, row.label])
    );
    expect(labels).toEqual({
      1: "Utility: audio.mojom.AudioService",
      2: "GPU",
      3: "Renderer"
    });
  });

  it("defaults missing CPU and memory figures to zero", () => {
    mockGetAppMetrics.mockReturnValue([{ type: "GPU", pid: 9 }]);
    openPerformanceMonitorWindow();

    jest.advanceTimersByTime(1000);

    expect(lastRows(mockWindows[0])).toEqual([
      { label: "GPU", pid: 9, cpu: 0, memoryMb: 0 }
    ]);
  });

  it("labels renderer processes with their page title, then URL, then a default", () => {
    mockGetAppMetrics.mockReturnValue([
      { type: "Tab", pid: 10 },
      { type: "Tab", pid: 11 },
      { type: "Tab", pid: 12 }
    ]);
    mockGetAllWebContents.mockReturnValue([
      { getOSProcessId: () => 10, getTitle: () => "Editor", getURL: () => "http://a" },
      { getOSProcessId: () => 11, getTitle: () => "", getURL: () => "http://b" },
      { getOSProcessId: () => 12, getTitle: () => "", getURL: () => "" }
    ]);
    openPerformanceMonitorWindow();

    jest.advanceTimersByTime(1000);

    const labels = Object.fromEntries(
      lastRows(mockWindows[0]).map((row) => [row.pid, row.label])
    );
    expect(labels).toEqual({ 10: "Editor", 11: "http://b", 12: "renderer" });
  });

  it("joins the labels of web contents that share a renderer process", () => {
    mockGetAppMetrics.mockReturnValue([{ type: "Tab", pid: 20 }]);
    mockGetAllWebContents.mockReturnValue([
      { getOSProcessId: () => 20, getTitle: () => "One", getURL: () => "" },
      { getOSProcessId: () => 20, getTitle: () => "Two", getURL: () => "" }
    ]);
    openPerformanceMonitorWindow();

    jest.advanceTimersByTime(1000);

    expect(lastRows(mockWindows[0])[0].label).toBe("One, Two");
  });

  it("skips a web contents that throws while being destroyed", () => {
    mockGetAppMetrics.mockReturnValue([{ type: "Tab", pid: 30 }]);
    mockGetAllWebContents.mockReturnValue([
      {
        getOSProcessId: () => {
          throw new Error("Object has been destroyed");
        }
      },
      { getOSProcessId: () => 30, getTitle: () => "Alive", getURL: () => "" }
    ]);
    openPerformanceMonitorWindow();

    jest.advanceTimersByTime(1000);

    expect(lastRows(mockWindows[0])[0].label).toBe("Alive");
  });

  it("keeps polling when the page rejects the update", async () => {
    mockExecuteResult = () => Promise.reject(new Error("page not ready"));
    openPerformanceMonitorWindow();
    const win = mockWindows[0];

    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    jest.advanceTimersByTime(1000);

    expect(win.webContents.executeJavaScript).toHaveBeenCalledTimes(2);
  });

  it("stops polling once the window is closed", () => {
    openPerformanceMonitorWindow();
    const win = mockWindows[0];
    jest.advanceTimersByTime(1000);
    const callsBeforeClose = win.webContents.executeJavaScript.mock.calls.length;

    closeWindow(win);
    jest.advanceTimersByTime(5000);

    expect(win.webContents.executeJavaScript).toHaveBeenCalledTimes(
      callsBeforeClose
    );
  });
});
