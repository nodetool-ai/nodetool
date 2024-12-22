export class AppError extends Error {
  constructor(message: string, public detail?: string) {
    super(message);
    this.name = "AppError";
    this.detail = detail;
  }
}

export const createErrorMessage = (
  error: any,
  defaultMessage: string
): Error => {
  if (error?.detail) {
    return new AppError(defaultMessage, error.detail.toString());
  }
  if (typeof error === "string") {
    return new AppError(defaultMessage, error);
  }
  if (error instanceof Error) {
    return new AppError(defaultMessage, error.message);
  }
  return new AppError(defaultMessage);
};
