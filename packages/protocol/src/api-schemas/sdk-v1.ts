import { z } from "zod";

export const sdkV1Error = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean()
});
export type SdkV1Error = z.infer<typeof sdkV1Error>;

export const sdkV1HttpError = sdkV1Error;
export type SdkV1HttpError = z.infer<typeof sdkV1HttpError>;

const RETRYABLE_ERROR_CODES = new Set([
  "INTERNAL_ERROR",
  "INTERNAL_SERVER_ERROR",
  "PYTHON_BRIDGE_UNAVAILABLE",
  "SERVICE_UNAVAILABLE",
  "TIMEOUT",
  "TOO_MANY_REQUESTS"
]);

export function isSdkV1RetryableError(
  code: string,
  message = ""
): boolean {
  if (message.toLowerCase().includes("disabled")) {
    return false;
  }
  return RETRYABLE_ERROR_CODES.has(code);
}
