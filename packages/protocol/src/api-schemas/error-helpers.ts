import { ApiErrorCode } from "./api-error-code.js";

/**
 * Shape of the `error.data` object attached to TRPCClientError when the server
 * uses the errorFormatter from @nodetool/websocket/src/trpc/error-formatter.
 * Re-declared here so clients don't depend on server internals.
 */
export interface NodetoolTRPCErrorData {
  apiCode: ApiErrorCode | null;
  zodError: Record<string, string[]> | null;
  code?: string;
  httpStatus?: number;
  path?: string;
}

export interface NodetoolTRPCClientError {
  data?: NodetoolTRPCErrorData | null;
  message: string;
}

export function isTRPCErrorWithCode(
  err: unknown,
  code: ApiErrorCode
): err is NodetoolTRPCClientError {
  if (err == null || typeof err !== "object") return false;
  const candidate = err as { data?: { apiCode?: unknown } };
  return candidate.data?.apiCode === code;
}
