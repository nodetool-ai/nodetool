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
    error !== null &&
    typeof error === "object" &&
    "detail" in error
  ) {
    const detail = (error as Record<string, unknown>).detail;
    if (detail) {
      return new AppError(defaultMessage, String(detail));
    }
  }
  if (typeof error === "string") {
    return new AppError(defaultMessage, error);
  }
  if (error instanceof Error) {
    return new AppError(defaultMessage, error.message);
  }
  return new AppError(defaultMessage);
};
