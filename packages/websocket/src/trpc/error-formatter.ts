import { TRPCError } from "@trpc/server";
import type { TRPCDefaultErrorShape as DefaultErrorShape } from "@trpc/server";
import { ZodError } from "zod";
import { ApiErrorCode } from "../error-codes.js";

export interface TRPCErrorCause {
  apiCode?: ApiErrorCode;
}

export interface ApiErrorShape extends DefaultErrorShape {
  data: DefaultErrorShape["data"] & {
    apiCode: ApiErrorCode | null;
    zodError: Record<string, string[]> | null;
  };
}

/**
 * Best-effort reverse mapping so errors thrown as raw TRPCError (without an
 * explicit apiCode cause) still get a consistent apiCode in the response shape.
 * Routers that use throwApiError() provide an exact code; this is the fallback.
 */
const API_CODE_BY_TRPC_CODE: Partial<Record<TRPCError["code"], ApiErrorCode>> = {
  NOT_FOUND: ApiErrorCode.NOT_FOUND,
  CONFLICT: ApiErrorCode.ALREADY_EXISTS,
  BAD_REQUEST: ApiErrorCode.INVALID_INPUT,
  UNAUTHORIZED: ApiErrorCode.UNAUTHORIZED,
  FORBIDDEN: ApiErrorCode.FORBIDDEN,
  INTERNAL_SERVER_ERROR: ApiErrorCode.INTERNAL_ERROR
};

export function errorFormatter({
  shape,
  error
}: {
  shape: DefaultErrorShape;
  error: TRPCError;
}): ApiErrorShape {
  const cause = error.cause as TRPCErrorCause | undefined;
  const zodError =
    error.cause instanceof ZodError
      ? (error.cause.flatten().fieldErrors as Record<string, string[]>)
      : null;
  return {
    ...shape,
    data: {
      ...shape.data,
      apiCode: cause?.apiCode ?? API_CODE_BY_TRPC_CODE[error.code] ?? null,
      zodError
    }
  };
}

interface ThrowApiErrorCause extends Error {
  apiCode: ApiErrorCode;
}

const TRPC_CODE_BY_API_CODE: Record<ApiErrorCode, TRPCError["code"]> = {
  [ApiErrorCode.NOT_FOUND]: "NOT_FOUND",
  [ApiErrorCode.WORKFLOW_NOT_FOUND]: "NOT_FOUND",
  [ApiErrorCode.ASSET_NOT_FOUND]: "NOT_FOUND",
  [ApiErrorCode.ALREADY_EXISTS]: "CONFLICT",
  [ApiErrorCode.INVALID_INPUT]: "BAD_REQUEST",
  [ApiErrorCode.MISSING_REQUIRED_FIELD]: "BAD_REQUEST",
  [ApiErrorCode.UNAUTHORIZED]: "UNAUTHORIZED",
  [ApiErrorCode.FORBIDDEN]: "FORBIDDEN",
  [ApiErrorCode.INTERNAL_ERROR]: "INTERNAL_SERVER_ERROR",
  [ApiErrorCode.SERVICE_UNAVAILABLE]: "INTERNAL_SERVER_ERROR",
  [ApiErrorCode.WORKFLOW_EXECUTION_FAILED]: "INTERNAL_SERVER_ERROR",
  [ApiErrorCode.ASSET_UPLOAD_FAILED]: "INTERNAL_SERVER_ERROR",
  [ApiErrorCode.PYTHON_BRIDGE_UNAVAILABLE]: "INTERNAL_SERVER_ERROR",
  [ApiErrorCode.TIMELINE_NO_MEDIA_OUTPUT]: "BAD_REQUEST",
  [ApiErrorCode.SKETCH_NO_IMAGE_OUTPUT]: "BAD_REQUEST"
};

export function throwApiError(
  apiCode: ApiErrorCode,
  message: string,
  trpcCode?: TRPCError["code"]
): never {
  const resolvedCode = trpcCode ?? TRPC_CODE_BY_API_CODE[apiCode] ?? "INTERNAL_SERVER_ERROR";
  const cause: ThrowApiErrorCause = Object.assign(new Error(message), {
    apiCode,
    name: "ApiError"
  });
  throw new TRPCError({ code: resolvedCode, message, cause });
}
