describe("ipcLogBridge", () => {
  let originalConsoleLog: typeof console.log;
  let originalConsoleInfo: typeof console.info;
  let originalConsoleWarn: typeof console.warn;
  let originalConsoleError: typeof console.error;

  const installApi = () => {
    const mockLog = jest.fn();
    (window as unknown as Record<string, unknown>).api = {
      logging: { log: mockLog }
    };
    return mockLog;
  };

  beforeEach(() => {
    originalConsoleLog = console.log;
    originalConsoleInfo = console.info;
    originalConsoleWarn = console.warn;
    originalConsoleError = console.error;
    jest.resetModules();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.info = originalConsoleInfo;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    delete (window as unknown as Record<string, unknown>).api;
  });

  it("replaces console methods after install (with the main-process channel)", async () => {
    installApi();
    const { installIpcLogBridge } = await import("../ipcLogBridge");
    const beforeLog = console.log;
    installIpcLogBridge();
    expect(console.log).not.toBe(beforeLog);
  });

  it("does NOT echo to the browser console", async () => {
    installApi();
    const original = jest.fn();
    console.log = original;
    console.error = original;
    const { installIpcLogBridge } = await import("../ipcLogBridge");
    installIpcLogBridge();

    console.log("hello");
    console.error("oops");
    // Forward-only: the captured original console must never be invoked.
    expect(original).not.toHaveBeenCalled();
  });

  it("forwards info/warn/error to window.api.logging.log", async () => {
    const mockLog = installApi();
    const { installIpcLogBridge } = await import("../ipcLogBridge");
    installIpcLogBridge();

    console.info("info text");
    expect(mockLog).toHaveBeenCalledWith("info", "info text", "web/console");

    console.warn("warning text");
    expect(mockLog).toHaveBeenCalledWith("warn", "warning text", "web/console");

    console.error("error text");
    expect(mockLog).toHaveBeenCalledWith("error", "error text", "web/console");
  });

  it("forwards console.log as info-level", async () => {
    const mockLog = installApi();
    const { installIpcLogBridge } = await import("../ipcLogBridge");
    installIpcLogBridge();

    console.log("logged");
    expect(mockLog).toHaveBeenCalledWith("info", "logged", "web/console");
  });

  it("drops browser-styled (%c) devtools logs (tRPC / react-query)", async () => {
    const mockLog = installApi();
    const { installIpcLogBridge } = await import("../ipcLogBridge");
    installIpcLogBridge();

    console.log(
      "%c << query #62 %cmodels.providers%c %O",
      "color: white",
      "font-weight: bold",
      "",
      { huge: "payload" }
    );
    expect(mockLog).not.toHaveBeenCalled();
  });

  it("truncates very long messages before forwarding", async () => {
    const mockLog = installApi();
    const { installIpcLogBridge } = await import("../ipcLogBridge");
    installIpcLogBridge();

    console.info("x".repeat(5000));
    expect(mockLog).toHaveBeenCalledTimes(1);
    expect((mockLog.mock.calls[0][1] as string).length).toBeLessThan(5000);
  });

  it("is idempotent — second call does not double-wrap", async () => {
    installApi();
    const { installIpcLogBridge } = await import("../ipcLogBridge");
    installIpcLogBridge();
    const afterFirst = console.log;
    installIpcLogBridge();
    expect(console.log).toBe(afterFirst);
  });

  it("handles Error objects in arguments", async () => {
    const mockLog = installApi();
    const { installIpcLogBridge } = await import("../ipcLogBridge");
    installIpcLogBridge();

    console.error(new Error("boom"));
    expect(mockLog).toHaveBeenCalledTimes(1);
    expect(mockLog.mock.calls[0][1] as string).toContain("boom");
  });

  it("handles non-string, non-Error arguments", async () => {
    const mockLog = installApi();
    const { installIpcLogBridge } = await import("../ipcLogBridge");
    installIpcLogBridge();

    console.error({ key: "value" });
    expect(mockLog).toHaveBeenCalledTimes(1);
    expect(mockLog.mock.calls[0][1] as string).toContain("key");
  });

  it("leaves the native console intact when window.api is missing", async () => {
    delete (window as unknown as Record<string, unknown>).api;
    const original = jest.fn();
    console.log = original;
    const { installIpcLogBridge } = await import("../ipcLogBridge");
    installIpcLogBridge();
    // No main-process channel: install is a no-op, so the native console is
    // preserved (logs aren't silently dropped in a plain-web context).
    expect(console.log).toBe(original);
    expect(() => console.warn("safe")).not.toThrow();
  });
});
