import type { Logger } from "@nodetool-ai/config";
import type { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
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

  logger[trpcErrorLogLevel(error)]("tRPC request failed", {
    requestId,
    path: path ?? null,
    code: error.code,
    httpStatus,
    error,
    ...(validationIssues === undefined ? {} : { validationIssues })
  });
}
