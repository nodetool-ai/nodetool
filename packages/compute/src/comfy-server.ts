// Helpers for a pod that runs an unmodified ComfyUI image. The direct
// `lib.comfy.RunWorkflow` node talks to it through the provider's HTTP proxy.

const DEFAULT_READY_TIMEOUT_MS = 600_000;
const DEFAULT_READY_INTERVAL_MS = 5_000;

/** Convert a worker's stored WebSocket URL to the node's HTTP endpoint. */
export function comfyEndpointFromWsUrl(wsUrl: string): string {
  return wsUrl.replace(/^ws(s?):/, "http$1:");
}

/** Ask once whether ComfyUI answers `/system_stats`. */
export async function isComfyServerReady(endpoint: string): Promise<boolean> {
  try {
    const response = await fetch(`${endpoint}/system_stats`, {
      signal: AbortSignal.timeout(DEFAULT_READY_INTERVAL_MS * 2),
    });
    return response.ok;
  } catch {
    // The proxy refuses connections until the port serves.
    return false;
  }
}

/**
 * Wait until ComfyUI answers `/system_stats`. A running pod does not prove that
 * ComfyUI started, and the proxy returns errors until the port serves.
 */
export async function waitForComfyServer(
  endpoint: string,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_READY_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;
  let lastFailure = "no response";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${endpoint}/system_stats`, {
        signal: AbortSignal.timeout(intervalMs * 2),
      });
      if (response.ok) {
        return;
      }
      lastFailure = `HTTP ${response.status}`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(
    `ComfyUI did not answer at ${endpoint}/system_stats within ` +
      `${Math.round(timeoutMs / 1000)}s (last result: ${lastFailure}).`
  );
}
