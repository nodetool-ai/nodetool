import { isObjectLike, isString } from "./typePredicates";
export class AppError extends Error {
  constructor(message: string, public detail?: string) {
    super(message);
    this.name = "AppError";
  }
}

const hasErrorMessage = (error: unknown): error is { message: string } =>
  typeof error === "object" &&
  error !== null &&
  "message" in error &&
  typeof error.message === "string";

/** The message of a thrown value, or `fallback` when it carries none. */
export const getErrorMessage = (error: unknown, fallback = ""): string =>
  hasErrorMessage(error) ? error.message : fallback;

export const createErrorMessage = (
  error: unknown,
  defaultMessage: string
): Error => {
  if (
    isObjectLike(error) &&
    "detail" in error &&
    error.detail
  ) {
    return new AppError(defaultMessage, String(error.detail));
  }
  if (isString(error)) {
    return new AppError(defaultMessage, error);
  }
  if (error instanceof Error) {
    return new AppError(defaultMessage, error.message);
  }
  return new AppError(defaultMessage);
};
