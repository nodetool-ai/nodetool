export class AppError extends Error {
  constructor(message: string, public detail?: string) {
    super(message);
    this.name = "AppError";
    this.detail = detail;
  }
}

export const createErrorMessage = (
  error: unknown,
  defaultMessage: string
): Error => {
  if (
    typeof error === "object" &&
    error !== null &&
    "detail" in error &&
    error.detail
  ) {
    return new AppError(defaultMessage, String(error.detail));
  }
  if (typeof error === "string") {
    return new AppError(defaultMessage, error);
  }
  if (error instanceof Error) {
    return new AppError(defaultMessage, error.message);
  }
  return new AppError(defaultMessage);
};
