import { probeHttpOk, waitForHttpOk } from "../httpProbe";

describe("probeHttpOk", () => {
  it("returns true when fetch returns an ok response", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });

    const result = await probeHttpOk("http://localhost:7777/ready", {
      timeoutMs: 100,
      fetchImpl: fetchMock,
    });

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:7777/ready",
      expect.objectContaining({
        method: "GET",
        signal: expect.any(AbortSignal),
      })
    );
  });

  it("returns false when fetch returns a non-ok response", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 500 });

    const result = await probeHttpOk("http://localhost:7777/ready", {
      timeoutMs: 100,
      fetchImpl: fetchMock,
    });

    expect(result).toBe(false);
  });

  it("returns false when fetch throws a network error", async () => {
    const fetchMock = jest
      .fn()
      .mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await probeHttpOk("http://localhost:7777/ready", {
      timeoutMs: 100,
      fetchImpl: fetchMock,
    });

    expect(result).toBe(false);
  });

  it("respects custom fetchImpl", async () => {
    const customFetch = jest.fn().mockResolvedValue({ ok: true });

    await probeHttpOk("http://localhost:9999/health", {
      fetchImpl: customFetch,
    });

    expect(customFetch).toHaveBeenCalledTimes(1);
    expect(customFetch).toHaveBeenCalledWith(
      "http://localhost:9999/health",
      expect.objectContaining({ method: "GET" })
    );
  });
});

describe("waitForHttpOk", () => {
  it("resolves when server becomes available after retries", async () => {
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce({ ok: true });

    await expect(
      waitForHttpOk("http://localhost:7777/ready", {
        timeoutMs: 500,
        requestTimeoutMs: 50,
        pollIntervalMs: 10,
        fetchImpl: fetchMock,
      })
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("throws when timeout elapses without success", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false });

    await expect(
      waitForHttpOk("http://localhost:7777/ready", {
        timeoutMs: 100,
        requestTimeoutMs: 20,
        pollIntervalMs: 10,
        fetchImpl: fetchMock,
      })
    ).rejects.toThrow("Server failed to become available");
  });

  it("uses custom error message when timeout elapses", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false });

    await expect(
      waitForHttpOk("http://localhost:7777/ready", {
        timeoutMs: 100,
        requestTimeoutMs: 20,
        pollIntervalMs: 10,
        fetchImpl: fetchMock,
        errorMessage: "Backend did not start in time",
      })
    ).rejects.toThrow("Backend did not start in time");
  });
});
