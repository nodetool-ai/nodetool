export type FetchLike = typeof fetch;

interface ProbeHttpOkOptions {
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

interface WaitForHttpOkOptions extends ProbeHttpOkOptions {
  pollIntervalMs?: number;
  requestTimeoutMs?: number;
  errorMessage?: string;
}

export async function probeHttpOk(
  url: string,
  options: ProbeHttpOkOptions = {}
): Promise<boolean> {
  const { timeoutMs = 15000, fetchImpl = fetch } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function waitForHttpOk(
  url: string,
  options: WaitForHttpOkOptions = {}
): Promise<void> {
  const {
    timeoutMs = 60000,
    requestTimeoutMs = 3000,
    pollIntervalMs = 250,
    fetchImpl = fetch,
    errorMessage = "Server failed to become available",
  } = options;

  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const isOk = await probeHttpOk(url, {
      timeoutMs: requestTimeoutMs,
      fetchImpl,
    });

    if (isOk) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(errorMessage);
}
