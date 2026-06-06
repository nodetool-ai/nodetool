describe("ipcLogBridge", () => {
  let originalConsoleLog: typeof console.log;
  let originalConsoleWarn: typeof console.warn;
  let originalConsoleError: typeof console.error;

  beforeEach(() => {
    originalConsoleLog = console.log;
    originalConsoleWarn = console.warn;
    originalConsoleError = console.error;
    jest.resetModules();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    delete (window as unknown as Record<string, unknown>).api;
  });

  it("replaces console methods after install", async () => {
    const { installIpcLogBridge } = await import("../ipcLogBridge");
    const beforeLog = console.log;
    installIpcLogBridge();
    expect(console.log).not.toBe(beforeLog);
  });

  it("still calls the original console methods", async () => {
    const spy = jest.fn();
    console.log = spy;
    const { installIpcLogBridge } = await import("../ipcLogBridge");
    installIpcLogBridge();
    console.log("test message");
    expect(spy).toHaveBeenCalledWith("test message");
  });

  it("forwards warn/error to window.api.logging.log", async () => {
    const mockLog = jest.fn();
    (window as unknown as Record<string, unknown>).api = {
      logging: { log: mockLog }
    };
    const { installIpcLogBridge } = await import("../ipcLogBridge");
    installIpcLogBridge();

    console.warn("warning text");
    expect(mockLog).toHaveBeenCalledWith("warn", "warning text", "web/console");

    console.error("error text");
    expect(mockLog).toHaveBeenCalledWith(
      "error",
      "error text",
      "web/console"
    );
  });

  it("does not forward info-level logs to main process", async () => {
    const mockLog = jest.fn();
    (window as unknown as Record<string, unknown>).api = {
      logging: { log: mockLog }
    };
    const { installIpcLogBridge } = await import("../ipcLogBridge");
    installIpcLogBridge();

    console.log("info message");
    expect(mockLog).not.toHaveBeenCalled();
  });

  it("is idempotent — second call does not double-wrap", async () => {
    const { installIpcLogBridge } = await import("../ipcLogBridge");
    installIpcLogBridge();
    const afterFirst = console.log;
    installIpcLogBridge();
    expect(console.log).toBe(afterFirst);
  });

  it("handles Error objects in arguments", async () => {
    const mockLog = jest.fn();
    (window as unknown as Record<string, unknown>).api = {
      logging: { log: mockLog }
    };
    const { installIpcLogBridge } = await import("../ipcLogBridge");
    installIpcLogBridge();

    const err = new Error("boom");
    console.error(err);
    expect(mockLog).toHaveBeenCalledTimes(1);
    const message = mockLog.mock.calls[0][1] as string;
    expect(message).toContain("boom");
  });

  it("handles non-string, non-Error arguments", async () => {
    const mockLog = jest.fn();
    (window as unknown as Record<string, unknown>).api = {
      logging: { log: mockLog }
    };
    const { installIpcLogBridge } = await import("../ipcLogBridge");
    installIpcLogBridge();

    console.error({ key: "value" });
    expect(mockLog).toHaveBeenCalledTimes(1);
    const message = mockLog.mock.calls[0][1] as string;
    expect(message).toContain("key");
  });

  it("does not throw when window.api is missing", async () => {
    delete (window as unknown as Record<string, unknown>).api;
    const { installIpcLogBridge } = await import("../ipcLogBridge");
    installIpcLogBridge();
    expect(() => console.warn("safe")).not.toThrow();
  });
});
