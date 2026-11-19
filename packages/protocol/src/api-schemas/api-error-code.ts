export enum ApiErrorCode {
  NOT_FOUND = "NOT_FOUND",
  ALREADY_EXISTS = "ALREADY_EXISTS",
  INVALID_INPUT = "INVALID_INPUT",
  MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  INTERNAL_ERROR = "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  WORKFLOW_NOT_FOUND = "WORKFLOW_NOT_FOUND",
  WORKFLOW_EXECUTION_FAILED = "WORKFLOW_EXECUTION_FAILED",
  ASSET_NOT_FOUND = "ASSET_NOT_FOUND",
  ASSET_UPLOAD_FAILED = "ASSET_UPLOAD_FAILED",
  PYTHON_BRIDGE_UNAVAILABLE = "PYTHON_BRIDGE_UNAVAILABLE",
  TIMELINE_NO_MEDIA_OUTPUT = "TIMELINE_NO_MEDIA_OUTPUT",
  SKETCH_NO_IMAGE_OUTPUT = "SKETCH_NO_IMAGE_OUTPUT",
  /** A published app's run would exceed its app-scoped spend budget. */
  BUDGET_EXCEEDED = "BUDGET_EXCEEDED",
  /**
   * The run names a managed model this server does not sell — the operator's
   * `NODETOOL_CREDIT_MODELS` whitelist leaves it out. A full balance does not
   * change the answer.
   */
  MODEL_NOT_AVAILABLE = "MODEL_NOT_AVAILABLE",
  /**
   * The request needs an optional package this install does not have. The
   * response names it in `runtime_package` so the client can offer to install
   * it.
   */
  MISSING_RUNTIME_PACKAGE = "MISSING_RUNTIME_PACKAGE",
  /**
   * A save adds a file the writer may not read: neither their own asset nor
   * a file of a document they may duplicate. Nothing was written.
   */
  FILE_NOT_READABLE = "FILE_NOT_READABLE",
  /**
   * The save is written in a lower document schema version than the stored
   * document. It would replace the document with a reduced copy.
   */
  SCHEMA_DOWNGRADE = "SCHEMA_DOWNGRADE",
  /**
   * The client's protocol version is below the lowest this server accepts
   * writes from. Listing and reading still work.
   */
  CLIENT_TOO_OLD = "CLIENT_TOO_OLD",
  /**
   * A transfer's commit attempt id was recorded with other content. A retry
   * must send what the first attempt sent, or take a new attempt id.
   */
  ATTEMPT_CONTENT_MISMATCH = "ATTEMPT_CONTENT_MISMATCH",
  /**
   * A receive's revision set expired, was released, or holds a revision or
   * file an owner's action freed. The client captures a new set (Y7).
   */
  REVISION_SET_EXPIRED = "REVISION_SET_EXPIRED",
  /**
   * The local transfer client was handed a cloud access token the cloud no
   * longer accepts. The app signs in again and hands a new one.
   */
  CLOUD_SIGNED_OUT = "CLOUD_SIGNED_OUT",
  /** The cloud could not be reached or failed. The same call may succeed later. */
  CLOUD_UNREACHABLE = "CLOUD_UNREACHABLE",
  /** The cloud refused the local transfer client's request. Sending it again will not help. */
  CLOUD_REFUSED = "CLOUD_REFUSED"
}

export interface ApiErrorResponse {
  code: ApiErrorCode;
  detail: string;
  /** Runtime package to install, for `MISSING_RUNTIME_PACKAGE`. */
  runtime_package?: string;
}

export function apiError(code: ApiErrorCode, detail: string): ApiErrorResponse {
  return { code, detail };
}
