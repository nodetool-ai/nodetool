import { computeHistogramAsync } from "../histogramAsync";

describe("computeHistogramAsync", () => {
  it("falls back to inline computation for small images", async () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255]);
    const hist = await computeHistogramAsync({
      rgba,
      width: 1,
      height: 1
    });
    expect(hist.pixelCount).toBe(1);
    expect(hist.r[255]).toBe(1);
  });

  it("falls back to inline when Worker is undefined", async () => {
    const originalWorker = global.Worker;
    // @ts-expect-error simulate environment without Worker
    global.Worker = undefined;

    const rgba = new Uint8ClampedArray([
      255, 255, 255, 255,
      0, 0, 0, 255
    ]);
    const hist = await computeHistogramAsync({
      rgba,
      width: 1,
      height: 2
    });
    expect(hist.pixelCount).toBe(2);

    global.Worker = originalWorker;
  });

  it("uses a Worker for large images when available", async () => {
    const mockPostMessage = jest.fn();
    const mockTerminate = jest.fn();
    const listeners: Record<string, ((e: unknown) => void)[]> = {};

    class MockWorker {
      addEventListener = jest.fn((event: string, handler: (e: unknown) => void) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(handler);
      });
      removeEventListener = jest.fn();
      postMessage = mockPostMessage;
      terminate = mockTerminate;
    }

    const originalWorker = global.Worker;
    // @ts-expect-error Mock Worker constructor
    global.Worker = MockWorker;

    const rgba = new Uint8ClampedArray(4 * 1024 * 1024 + 4);
    rgba[0] = 128;
    const promise = computeHistogramAsync({
      rgba,
      width: 1024,
      height: 1024 + 1
    });

    expect(mockPostMessage).toHaveBeenCalledTimes(1);
    const postArgs = mockPostMessage.mock.calls[0];
    expect(postArgs[0]).toHaveProperty("id");
    expect(postArgs[0]).toHaveProperty("rgbaBuffer");

    // Simulate successful worker response
    const messageHandlers = listeners["message"] || [];
    const response = {
      id: postArgs[0].id,
      r: new Uint32Array(256).buffer,
      g: new Uint32Array(256).buffer,
      b: new Uint32Array(256).buffer,
      luminance: new Uint32Array(256).buffer,
      pixelCount: rgba.length / 4
    };
    messageHandlers.forEach((h) =>
      h({ data: response } as MessageEvent)
    );

    const hist = await promise;
    expect(hist.pixelCount).toBe(rgba.length / 4);
    expect(mockTerminate).toHaveBeenCalledTimes(1);

    global.Worker = originalWorker;
  });

  it("rejects only the affected request when a Worker errors", async () => {
    const listeners: Record<string, ((e: unknown) => void)[]> = {};

    class MockWorker {
      addEventListener = jest.fn((event: string, handler: (e: unknown) => void) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(handler);
      });
      removeEventListener = jest.fn();
      postMessage = jest.fn();
      terminate = jest.fn();
    }

    const originalWorker = global.Worker;
    // @ts-expect-error Mock Worker constructor
    global.Worker = MockWorker;

    const rgba = new Uint8ClampedArray(4 * 1024 * 1024 + 4);
    const promise = computeHistogramAsync({
      rgba,
      width: 1024,
      height: 1024 + 1
    });

    const errorHandlers = listeners["error"] || [];
    errorHandlers.forEach((h) =>
      h(new ErrorEvent("error", { message: "worker crash" }))
    );

    await expect(promise).rejects.toThrow("worker crash");

    global.Worker = originalWorker;
  });
});
