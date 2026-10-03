import type { Logger } from "@nodetool-ai/config";
import type { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { captureError } from "../error-traces.js";
import { isObjectLike } from "../lib/wire-values.js";

export type TrpcErrorLogLevel = "warn" | "error";

/**
 * Client and authentication failures are expected request outcomes. Server
 * failures, including output-validation failures, remain error-level events.
 */
export function trpcErrorLogLevel(error: TRPCError): TrpcErrorLogLevel {
  return getHTTPStatusCodeFromError(error) >= 500 ? "error" : "warn";
}

export function logTrpcRequestError(
  logger: Logger,
  options: {
    error: TRPCError;
    path: string | undefined;
    requestId: string;
  }
): void {
  const { error, path, requestId } = options;
  const httpStatus = getHTTPStatusCodeFromError(error);
  const cause = error.cause;
  const validationIssues =
    isObjectLike(cause) && "issues" in cause ? cause.issues : undefined;

  const context: Record<string, unknown> = {
    requestId,
    path: path ?? null,
    code: error.code,
    httpStatus,
    error
  };
  if (validationIssues !== undefined) {
    context.validationIssues = validationIssues;
  }

  logger[trpcErrorLogLevel(error)]("tRPC request failed", context);
}

/**
 * Store a redacted trace for a server-side tRPC failure. Client errors
 * (4xx) are expected outcomes, not defects, and are not traced.
 */
export function traceTrpcRequestError(options: {
  error: TRPCError;
  path: string | undefined;
  requestId: string;
  userId: string | null | undefined;
}): void {
  const { error, path, requestId, userId } = options;
  const httpStatus = getHTTPStatusCodeFromError(error);
  if (httpStatus < 500) return;
  captureError(error.cause ?? error, {
    source: "trpc",
    userId,
    context: {
      route: path ?? "",
      code: error.code,
      http_status: httpStatus,
      request_id: requestId
    }
  });
}
