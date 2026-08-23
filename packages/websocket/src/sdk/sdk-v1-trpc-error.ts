import { ApiErrorCode } from "../error-codes.js";
import { throwApiError } from "../trpc/error-formatter.js";
import { SdkV1ServiceError } from "./sdk-v1-service-error.js";

/** Maps stable service errors into the retained tRPC `data.apiCode` shape. */
export function throwSdkV1TrpcError(error: unknown): never {
  if (!(error instanceof SdkV1ServiceError)) {
    throw error;
  }

  switch (error.category) {
    case "authentication-required":
      throwApiError(ApiErrorCode.UNAUTHORIZED, error.publicMessage);
    case "not-found":
      throwApiError(
        error.code === "WORKFLOW_NOT_FOUND"
          ? ApiErrorCode.WORKFLOW_NOT_FOUND
          : ApiErrorCode.NOT_FOUND,
        error.publicMessage
      );
    case "invalid-resource":
    case "payload-too-large":
      throwApiError(ApiErrorCode.INVALID_INPUT, error.publicMessage);
    case "not-implemented":
    case "unavailable":
      throwApiError(ApiErrorCode.SERVICE_UNAVAILABLE, error.publicMessage);
    case "internal":
      throwApiError(ApiErrorCode.INTERNAL_ERROR, error.publicMessage);
  }
}
