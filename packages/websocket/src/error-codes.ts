/**
 * Standard API error codes for machine-readable error handling.
 * Clients should match on `code` rather than parsing `detail` strings.
 */
export enum ApiErrorCode {
  // Resource errors
  NOT_FOUND = "NOT_FOUND",
  ALREADY_EXISTS = "ALREADY_EXISTS",

  // Input errors
  INVALID_INPUT = "INVALID_INPUT",
  MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",

  // Auth errors
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",

  // Server errors
  INTERNAL_ERROR = "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",

  // Workflow errors
  WORKFLOW_NOT_FOUND = "WORKFLOW_NOT_FOUND",
  WORKFLOW_EXECUTION_FAILED = "WORKFLOW_EXECUTION_FAILED",

  // Asset errors
  ASSET_NOT_FOUND = "ASSET_NOT_FOUND",
  ASSET_UPLOAD_FAILED = "ASSET_UPLOAD_FAILED",

  // Bridge errors
  PYTHON_BRIDGE_UNAVAILABLE = "PYTHON_BRIDGE_UNAVAILABLE",
}

export interface ApiErrorResponse {
  code: ApiErrorCode;
  detail: string;
}

/** Helper to create a standardized error response */
export function apiError(code: ApiErrorCode, detail: string): ApiErrorResponse {
  return { code, detail };
}
