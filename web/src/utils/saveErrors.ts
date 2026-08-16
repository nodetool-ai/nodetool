import { isNumber, isObjectLike, isString } from "./typePredicates";
/**
 * saveErrors
 *
 * Tells an autosave loop whether resending the same document can ever succeed.
 * A document the server's schema rejects, or one the user may not write, comes
 * back the same way every time — retrying it is a loop that never ends and
 * never saves anything.
 */

/** tRPC hangs the error code and the HTTP status off `error.data`. */
const errorStatus = (
  error: unknown
) => {
  if (!isObjectLike(error) || !("data" in error)) {
    return { code: null, httpStatus: null };
  }
  const data = (error as { data?: unknown }).data;
  if (!isObjectLike(data)) {
    return { code: null, httpStatus: null };
  }
  const { code, httpStatus } = data as { code?: unknown; httpStatus?: unknown };
  return {
    code: isString(code) ? code : null,
    httpStatus: isNumber(httpStatus) ? httpStatus : null
  };
};

/** 4xx statuses a later identical request can still satisfy. */
const RETRYABLE_STATUS = new Set([408, 425, 429]);

const PERMANENT_CODES = new Set([
  "BAD_REQUEST",
  "PARSE_ERROR",
  "PAYLOAD_TOO_LARGE",
  "UNPROCESSABLE_CONTENT",
  "UNSUPPORTED_MEDIA_TYPE",
  "METHOD_NOT_SUPPORTED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND"
]);

/**
 * Whether the same payload will be rejected again. A network failure, a 5xx,
 * or anything unclassifiable counts as transient, so the caller retries it —
 * within its own bound.
 */
export const isPermanentSaveError = (error: unknown): boolean => {
  const { code, httpStatus } = errorStatus(error);
  if (httpStatus !== null) {
    return (
      httpStatus >= 400 && httpStatus < 500 && !RETRYABLE_STATUS.has(httpStatus)
    );
  }
  return code !== null && PERMANENT_CODES.has(code);
};

/** Retries after the first failed attempt, for a transient failure only. */
export const MAX_TRANSIENT_SAVE_RETRIES = 4;
