import { probeHttpOk, waitForHttpOk } from "../httpProbe";

describe("httpProbe", () => {
  it("reports success when the endpoint responds with an OK status", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });

    await expect(
      probeHttpOk("http://127.0.0.1:7777/ready", {
        timeoutMs: 25,
        fetchImpl: fetchMock,
      })
    ).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:7777/ready",
      expect.objectContaining({
        method: "GET",
        signal: expect.any(AbortSignal),
      })
    );
  });

  it("retries when an early probe misses a backend that becomes ready shortly after", async () => {
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("timed out"), { name: "AbortError" }))
      .mockResolvedValueOnce({ ok: true });

    await expect(
      waitForHttpOk("http://127.0.0.1:7777/ready", {
        timeoutMs: 100,
        requestTimeoutMs: 25,
        pollIntervalMs: 0,
        fetchImpl: fetchMock,
      })
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:7777/ready",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("times out when the backend does not become ready before the configured deadline", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false });

    await expect(
      waitForHttpOk("http://127.0.0.1:7777/ready", {
        timeoutMs: 20,
        requestTimeoutMs: 10,
        pollIntervalMs: 0,
        fetchImpl: fetchMock,
      })
    ).rejects.toThrow("Server failed to become available");
  });
});
