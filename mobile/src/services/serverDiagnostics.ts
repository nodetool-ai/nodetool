export type ServerDiagnosticStatus =
  | "timeout"
  | "network-error"
  | "unauthorized"
  | "incompatible"
  | "ready";

export interface ServerDiagnosticResult {
  readonly status: ServerDiagnosticStatus;
  readonly statusCode?: number;
}

const READY_PATH = "/ready";
const WORKFLOW_PROBE_PATH = "/api/workflows/?limit=1";
const DEFAULT_PROBE_TIMEOUT_MS = 15_000;

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

/**
 * Probe a candidate NodeTool server without sending the app's credentials.
 *
 * The public readiness endpoint separates reachability from the protected API
 * probe. A 401/403 from the latter proves that the server is reachable but the
 * current session is not accepted. No session credential is sent to either
 * request because the host is user-configured.
 */
export async function diagnoseServer(
  host: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = DEFAULT_PROBE_TIMEOUT_MS
): Promise<ServerDiagnosticResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const base = host.replace(/\/+$/, "");
    const requestInit: RequestInit = {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    };

    const readinessResponse = await fetchImpl(`${base}${READY_PATH}`, requestInit);
    if (readinessResponse.status === 401 || readinessResponse.status === 403) {
      return { status: "unauthorized", statusCode: readinessResponse.status };
    }
    if (!readinessResponse.ok) {
      return { status: "incompatible", statusCode: readinessResponse.status };
    }

    const response = await fetchImpl(
      `${base}${WORKFLOW_PROBE_PATH}`,
      requestInit
    );

    if (response.status === 401 || response.status === 403) {
      return { status: "unauthorized", statusCode: response.status };
    }

    if (response.ok) {
      return { status: "ready", statusCode: response.status };
    }

    return { status: "incompatible", statusCode: response.status };
  } catch (error: unknown) {
    if (controller.signal.aborted || isAbortError(error)) {
      return { status: "timeout" };
    }

    return { status: "network-error" };
  } finally {
    clearTimeout(timeoutId);
  }
}
