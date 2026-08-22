export type SdkV1ServiceErrorCategory =
  | "authentication-required"
  | "internal"
  | "invalid-resource"
  | "not-found"
  | "not-implemented"
  | "payload-too-large"
  | "unavailable";

export interface SdkV1HttpErrorBody {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly detail: string;
}

export interface SdkV1RpcErrorBody {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

export class SdkV1ServiceError extends Error {
  readonly category: SdkV1ServiceErrorCategory;
  readonly code: string;
  readonly publicMessage: string;
  readonly retryable: boolean;

  constructor(
    category: SdkV1ServiceErrorCategory,
    code: string,
    publicMessage: string,
    retryable = false,
    cause?: unknown
  ) {
    super(publicMessage, cause === undefined ? undefined : { cause });
    this.name = "SdkV1ServiceError";
    this.category = category;
    this.code = code;
    this.publicMessage = publicMessage;
    this.retryable = retryable;
  }
}

function httpStatus(category: SdkV1ServiceErrorCategory): number {
  switch (category) {
    case "authentication-required":
      return 401;
    case "not-found":
      return 404;
    case "payload-too-large":
      return 413;
    case "invalid-resource":
      return 422;
    case "not-implemented":
      return 501;
    case "unavailable":
      return 503;
    case "internal":
      return 500;
  }
}

export function internalSdkV1ServiceError(cause: unknown): SdkV1ServiceError {
  return new SdkV1ServiceError(
    "internal",
    "INTERNAL_ERROR",
    "Internal server error",
    true,
    cause
  );
}

export function normalizeSdkV1ServiceError(error: unknown): SdkV1ServiceError {
  return error instanceof SdkV1ServiceError
    ? error
    : internalSdkV1ServiceError(error);
}

export function sdkV1HttpError(error: SdkV1ServiceError): {
  readonly status: number;
  readonly body: SdkV1HttpErrorBody;
} {
  return {
    status: httpStatus(error.category),
    body: {
      code: error.code,
      message: error.publicMessage,
      retryable: error.retryable,
      detail: error.publicMessage
    }
  };
}

export function sdkV1RpcError(error: SdkV1ServiceError): SdkV1RpcErrorBody {
  return {
    code: error.code,
    message: error.publicMessage,
    retryable: error.retryable
  };
}

export function reportSdkV1InternalError(
  error: SdkV1ServiceError,
  reporter?: (cause: unknown) => void
): void {
  if (error.category !== "internal") {
    return;
  }
  try {
    reporter?.(error.cause ?? error);
  } catch {
    // Diagnostics must not replace the redacted public response.
  }
}
